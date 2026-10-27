#!/usr/bin/env node
/**
 * cellularAutomata3d colorMode changes the output on both backends.
 *
 * The definition offers colorMode with the choices mono and age, and help.md
 * documents it as "Color mode, mono/age". Neither shader read the uniform:
 * both wrote the alive value to every channel, so the age the simulation
 * computed was lost each frame and age gave the same frame as mono.
 *
 * The state keeps alive in red and age in green. render3d shades with the
 * volume's RGB color unless it is gray, so mono must stay gray and age must
 * shade the cells with color. After 30 frames:
 * - every mono pixel is gray, and the age frame has colored pixels;
 * - the age frame differs from the mono frame;
 * - WebGL2 and WebGPU give identical frames for each mode, with the backend
 *   asserted.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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

const SIZE = 128
const FRAMES = 30
const MODES = ['mono', 'age']
const dsl = (mode) => `search synth3d, render
cellularAutomata3d(ruleIndex: diamoeba, colorMode: ${mode}).render3d().write(o0)
render(o0)`
const sha = (png) => crypto.createHash('sha256').update(png.data).digest('hex')

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())

// Each case starts on a new renderer, so its simulation state does not
// continue from another case's frames.
async function capture(gpu, mode) {
    const page = await browser.newPage()
    const messages = []
    page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) messages.push(m.text()) })
    page.on('pageerror', (e) => messages.push(e.message))
    await page.goto(`${base}/shaders/effects/manifest.json`)
    await page.setContent(String.raw`<canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:${SIZE},height:${SIZE},basePath:'${base}/shaders',preferWebGPU:${gpu}});
await renderer.loadManifest(); await renderer.loadEffects(['synth3d/cellularAutomata3d','render/render3d']);
window.capture = async (dsl, frames) => {
    await renderer.compile(dsl);
    renderer.stop();
    for (let i = 0; i < frames; i++) renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(), png:renderer.canvas.toDataURL()};
};
</script>`)
    await page.waitForFunction(() => typeof window.capture === 'function')
    messages.length = 0
    const result = await page.evaluate(([d, n]) => window.capture(d, n), [dsl(mode), FRAMES])
    const backend = gpu ? 'WebGPU' : 'WebGL2'
    assert.equal(result.backend, backend, `${mode}: backend`)
    assert.deepEqual(messages, [], `${backend} ${mode} console output:\n${messages.join('\n')}`)
    await page.close()
    return PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
}

const colored = (png) => {
    let n = 0
    for (let i = 0; i < png.data.length; i += 4) if (png.data[i] !== png.data[i + 1] || png.data[i + 1] !== png.data[i + 2]) n++
    return n
}

const frames = {}
try {
    for (const gpu of [false, true]) {
        const backend = gpu ? 'WebGPU' : 'WebGL2'
        const mono = await capture(gpu, 'mono')
        const age = await capture(gpu, 'age')
        frames[backend] = { mono, age }
        assert.equal(colored(mono), 0, `${backend}: mono has ${colored(mono)} colored pixels`)
        assert.ok(colored(age) > 0, `${backend}: age has no colored pixel`)
        assert.ok(!mono.data.equals(age.data), `${backend}: age gives the same frame as mono (${sha(mono)})`)
        console.log(`${backend}: mono ${sha(mono)} (gray), age ${sha(age)} (${colored(age)} of ${SIZE * SIZE} pixels colored)`)
    }
    for (const mode of MODES) {
        assert.ok(frames.WebGL2[mode].data.equals(frames.WebGPU[mode].data), `WebGL2 and WebGPU differ for colorMode ${mode}`)
        console.log(`colorMode ${mode}: WebGL2 and WebGPU frames identical`)
    }
    console.log(`cellularAutomata3d colorMode: age differs from mono after ${FRAMES} frames on both backends`)
} finally {
    await browser.close()
    await releaseServer()
}
