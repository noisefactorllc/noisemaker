#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effectsDir = path.join(repoRoot, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
const browser = await chromium.launch(shaderTestBrowserOptions())

// Hand-calculated overlap colors for a blue backdrop and a red source.
// These catch blending premultiplied colors and losing uncovered source color.
const blends = {
    add: [1, 0, 1], burn: [0, 0, 1], darken: [0, 0, 0], diff: [1, 0, 1],
    dodge: [0, 0, 1], exclusion: [1, 0, 1], hardLight: [1, 0, 0],
    lighten: [1, 0, 1], mix: [1, 0, 0], multiply: [0, 0, 0],
    negation: [1, 0, 1], overlay: [0, 0, 1], phoenix: [0, 1, 0],
    screen: [1, 0, 1], softLight: [0, 0, 1], subtract: [0, 0, 1],
}
const cases = []
for (const [mode, blended] of Object.entries(blends)) {
    for (const baseAlpha of [0, 0.5, 1]) {
        for (const sourceAlpha of [0, 0.5, 1]) {
            for (const opacity of [0, 0.5, 1]) {
                cases.push({ mode, blended, baseAlpha, sourceAlpha, opacity,
                    mixAmt: mode === 'mix' ? opacity * 200 - 100 : opacity * 100 - 100 })
            }
        }
    }
    // The positive half of the mixer axis fades from the blend to source B.
    for (const mixAmt of [50, 100]) {
        const factor = mixAmt / 100
        for (const alpha of [0.5, 1]) cases.push({ mode, blended: mode === 'mix' ? blended : blended.map((c, i) => c * (1 - factor) + Number(i === 0) * factor),
            baseAlpha: alpha, sourceAlpha: alpha, opacity: mode === 'mix' ? (mixAmt + 100) / 200 : 1, mixAmt })
    }
}

// Fractional RGB values expose blend functions incorrectly applied to
// premultiplied inputs (primary colors alone cannot detect that for multiply).
// At alpha 0.5 over alpha 0.5, straight output is (base + source + blend) / 3.
const fractionalPixels = {
    add: [170, 170, 170, 191], burn: [86, 86, 87, 191],
    darken: [107, 128, 107, 191], diff: [128, 85, 128, 191],
    dodge: [170, 170, 170, 191], exclusion: [139, 128, 139, 191],
    hardLight: [139, 128, 117, 191], lighten: [149, 128, 149, 191],
    mix: [149, 128, 107, 191], multiply: [101, 107, 101, 191],
    negation: [170, 170, 170, 191], overlay: [117, 128, 139, 191],
    phoenix: [128, 170, 128, 191], screen: [155, 149, 155, 191],
    softLight: [117, 128, 141, 191], subtract: [85, 85, 128, 191],
}
for (const [mode, expected] of Object.entries(fractionalPixels)) {
    cases.push({ mode, baseAlpha: 0.5, sourceAlpha: 0.5,
        baseColor: '#4080c0', sourceColor: '#c08040',
        mixAmt: mode === 'mix' ? 100 : 0, expected })
}

function expectedPixel({ blended, baseAlpha, sourceAlpha, opacity }) {
    const sourceCoverage = sourceAlpha * opacity
    const alpha = sourceCoverage + baseAlpha * (1 - sourceCoverage)
    if (!alpha) return [0, 0, 0, 0]
    // Source-over partitions each pixel into source-only, overlap, and base-only.
    const rgb = blended.map((c, i) => (
        Number(i === 0) * sourceCoverage * (1 - baseAlpha) +
        c * sourceCoverage * baseAlpha +
        Number(i === 2) * baseAlpha * (1 - sourceCoverage)
    ) / alpha)
    return [...rgb, alpha].map(c => Math.round(c * 255))
}

async function install(preferWebGPU) {
    const page = await browser.newPage()
    const errors = []
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
    await page.setContent(`<canvas id="canvas" width="8" height="8"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:8,height:8,basePath:'${baseUrl}/shaders',preferWebGPU:${preferWebGPU}});
await renderer.loadManifest();
await renderer.loadEffects(['synth/solid','mixer/blendMode']);
window.renderDsl = async dsl => {
    await renderer.compile(dsl);
    renderer.render(0); renderer.render(0);
    const queue = renderer.pipeline?.backend?.device?.queue;
    if(queue?.onSubmittedWorkDone) await queue.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(),png:renderer.canvas.toDataURL('image/png')};
};
</script>`)
    await page.waitForFunction(() => typeof window.renderDsl === 'function')
    return { page, errors }
}

try {
    const results = []
    for (const [preferWebGPU, backend] of [[false, 'WebGL2'], [true, 'WebGPU']]) {
        const { page, errors } = await install(preferWebGPU)
        const pixels = []
        for (const c of cases) {
            const dsl = `search synth, mixer
solid(color: ${c.baseColor || '#0000ff'}, alpha: ${c.baseAlpha}).write(o0); solid(color: ${c.sourceColor || '#ff0000'}, alpha: ${c.sourceAlpha}).write(o1); read(o0).blendMode(tex: read(o1), mode: ${c.mode}, mixAmt: ${c.mixAmt}).write(o2); render(o2)`
            const result = await page.evaluate(dsl => window.renderDsl(dsl), dsl)
            assert.equal(result.backend, backend, 'Backend fallback must not masquerade as parity')
            const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
            const expected = c.expected || expectedPixel(c)
            const label = `${backend} ${c.mode} base=${c.baseAlpha} source=${c.sourceAlpha} mixAmt=${c.mixAmt}`
            for (let i = 0; i < png.data.length; i++) {
                assert.ok(Math.abs(png.data[i] - expected[i % 4]) <= 1,
                    `${label}: expected ${expected}, got ${Array.from(png.data.slice(0, 4))}`)
            }
            pixels.push(png.data)
            if (pixels.length % 64 === 0) console.log(`${backend}: verified ${pixels.length}/${cases.length} alpha cases`)
        }
        assert.deepEqual(errors, [], `${backend} browser errors`)
        results.push(pixels)
        await page.close()
        console.log(`${backend}: ${cases.length} decoded PNG alpha/mixer-axis cases passed`)
    }
    for (let i = 0; i < cases.length; i++) {
        assert.deepEqual(results[0][i], results[1][i], `Exact GLSL/WGSL rendered pixels: ${JSON.stringify(cases[i])}`)
    }
    console.log(`Exact GLSL/WGSL parity: ${cases.length} cases; zero differing bytes`)
} finally {
    await browser.close()
    await releaseServer()
}
