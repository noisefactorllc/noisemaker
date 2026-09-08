#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
const cases = []
cases.push({ label: 'explicit transparent mask background',
    dsl: 'solid(color: #ff0000, alpha: 0.5).alphaMask(tex: solid(color: #808080), baseTex: none, maskMode: true).write(o0)',
    expected: [1, 0, 0, 64 / 255] })
cases.push({ label: 'mask background is ignored in composite mode',
    dsl: 'solid(color: #ff0000, alpha: 0.5).alphaMask(tex: solid(color: #0000ff, alpha: 0.5), baseTex: solid(color: #00ff00), mix: 0).write(o0)',
    expected: [1 / 3, 0, 2 / 3, 0.75] })
for (const spatial of ['baseTex', 'tex']) {
    cases.push({ label: `spatial ${spatial} at native 2x1 dimensions`,
        dsl: 'solid(color: #ff0000).alphaMask(tex: solid(color: #000000), baseTex: solid(color: #0000ff), maskMode: true).write(o0)',
        textureInputs: [{ uniform: spatial, width: 2, height: 1,
            data: spatial === 'baseTex' ? [255, 0, 0, 255, 0, 0, 255, 255] : [0, 0, 0, 255, 255, 255, 255, 255] }],
        expectedAt: x => {
            const t = Math.max(0, Math.min(1, (x + 0.5) / 8 * 2 - 0.5))
            return spatial === 'baseTex' ? [1 - t, 0, t, 1] : [t, 0, 1 - t, 1]
        } })
}

// Color filters must operate on the underlying color while retaining coverage.
for (const alpha of [0, 0.5, 1]) {
    for (const [call, rgb] of [
        ['invert(mode: full)', [191, 127, 63]],
        ['invert(mode: solarize)', [64, 127, 63]],
        ['tint(color: #ff0000, alpha: 1, mode: overlay)', [255, 0, 0]],
        ['tint(color: #808080, alpha: 1, mode: multiply)', [32, 64, 96]],
        ['tint(color: #ff0000, alpha: 1, mode: recolor)', [192, 96, 96]],
    ]) {
        cases.push({ label: `${call}, source alpha ${alpha}`,
            dsl: `solid(color: #4080c0, alpha: ${alpha}).${call}.write(o0)`,
            expected: alpha ? [...rgb.map(v => v / 255), alpha] : [0, 0, 0, 0] })
    }
}

// Composite a masked red source onto opaque blue. This also exposes RGB
// leaking from alpha-zero pixels, which PNG unpremultiplication can conceal.
for (const alpha of [0, 0.25, 0.5, 1]) {
    for (const [mask, coverage] of [['#000000', 0], ['#404040', 64 / 255], ['#808080', 128 / 255], ['#ffffff', 1]]) {
        const amount = alpha * coverage
        cases.push({ label: `mask ${mask}, source alpha ${alpha}`,
            dsl: `solid(color: #ff0000, alpha: ${alpha}).alphaMask(tex: solid(color: ${mask}), maskMode: true).write(o1)\nsolid(color: #0000ff).blendMode(tex: read(o1), mode: mix, mix: 100).write(o0)`,
            expected: [amount, 0, 1 - amount, 1] })
    }
}

// A masked adjustment replaces its input by the mask weight. It must preserve
// fractional alpha for color-only changes and allow alpha-reducing effects.
for (const baseAlpha of [0, 0.25, 0.5, 1])
for (const alpha of [0, 0.25, 0.5, 1]) {
    for (const [mask, coverage] of [['#000000', 0], ['#404040', 64 / 255], ['#808080', 128 / 255], ['#ffffff', 1]]) {
        const red = alpha * coverage
        const blue = baseAlpha * (1 - coverage)
        const outputAlpha = red + blue
        cases.push({ label: `masked replacement ${mask}, base alpha ${baseAlpha}, effect alpha ${alpha}`,
            dsl: `solid(color: #0000ff, alpha: ${baseAlpha}).write(o1)\nsolid(color: #ff0000, alpha: ${alpha}).alphaMask(tex: solid(color: ${mask}), baseTex: read(o1), maskMode: true).write(o0)`,
            expected: outputAlpha ? [red / outputAlpha, 0, blue / outputAlpha, outputAlpha] : [0, 0, 0, 0] })
    }
}

// Expected red/blue coverage from the documented mixer axis. Evaluate alpha
// independently as the union of covered areas, including the two endpoints.
for (const a of [0, 0.5, 1]) for (const b of [0, 0.5, 1]) {
    for (const mix of [-100, -50, -0.01, 0, 50, 100]) {
        const t = mix < 0 ? (mix + 100) / 100 : mix / 100
        const red = mix < 0 ? a : a * (1 - b) * (1 - t)
        const blue = mix < 0 ? b * (1 - a) * t : b
        const alpha = red + blue
        cases.push({ label: `A ${a}, B ${b}, mix ${mix}`,
            dsl: `solid(color: #ff0000, alpha: ${a}).alphaMask(tex: solid(color: #0000ff, alpha: ${b}), mix: ${mix}).write(o0)`,
            expected: alpha ? [red / alpha, 0, blue / alpha, alpha] : [0, 0, 0, 0] })
    }
}

try {
    const frames = []
    for (const gpu of [false, true]) {
        const page = await browser.newPage()
        const errors = []
        await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(`${base}/shaders/effects/manifest.json`)
        await page.setContent(`<canvas id="canvas" width="8" height="8"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:8,height:8,basePath:'${base}/shaders',preferWebGPU:${gpu}});
await renderer.loadManifest(); await renderer.loadEffects(['synth/solid','mixer/alphaMask','mixer/blendMode','filter/invert','filter/tint']);
window.capture = async ({dsl, textureInputs = []}) => {
    await renderer.compile('search synth, mixer, filter\\n' + dsl + '\\nrender(o0)');
    for (const fixture of textureInputs) {
        const pass = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'alphaMask');
        const id = 'alpha_mask_test_' + fixture.uniform;
        pass.inputs[fixture.uniform] = id;
        const source = document.createElement('canvas');
        source.width = fixture.width; source.height = fixture.height;
        source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fixture.data), fixture.width, fixture.height), 0, 0);
        renderer.updateTextureFromSource(id, source, {flipY: false});
    }
    renderer.render(0); renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(), png:renderer.canvas.toDataURL()};
};
</script>`)
        await page.waitForFunction(() => typeof window.capture === 'function')
        const pixels = []
        for (const c of cases) {
            const result = await page.evaluate(async fixture => {
                try { return await window.capture(fixture) }
                catch (error) { throw new Error(JSON.stringify(error, Object.getOwnPropertyNames(error))) }
            }, { dsl: c.dsl, textureInputs: c.textureInputs })
            assert.equal(result.backend, gpu ? 'WebGPU' : 'WebGL2', 'Backend fallback cannot certify parity')
            const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
            for (let i = 0; i < png.data.length; i++) {
                const expected = (c.expectedAt ? c.expectedAt(Math.floor(i / 4) % 8) : c.expected).map(value => Math.round(value * 255))
                assert.ok(Math.abs(png.data[i] - expected[i % 4]) <= 1,
                    `${result.backend} ${c.label}, pixel ${Math.floor(i / 4)}: expected ${expected}, got ${[...png.data.subarray(i - i % 4, i - i % 4 + 4)]}`)
            }
            pixels.push(png.data)
        }
        assert.deepEqual(errors, [], 'Browser errors')
        frames.push(pixels)
        await page.close()
        console.log(`${gpu ? 'WebGPU' : 'WebGL2'}: ${cases.length} alpha-mask coverage and mixer-axis cases passed`)
    }
    frames[0].forEach((pixels, i) => assert.deepEqual(pixels, frames[1][i], `Exact GLSL/WGSL pixels: ${cases[i].label}`))
    console.log(`Exact alpha-mask pixel parity: ${cases.length} cases; zero differing bytes`)
} finally {
    await browser.close()
    await releaseServer()
}
