#!/usr/bin/env node
/**
 * Software rendering mode on a real WebGL2 context.
 *
 * - 'on' renders one frame on WebGL2 (WebGPU refused) and runs no loop;
 *   stepFrame() advances time by 1 / (60 * loopDuration) and the simulation
 *   by one frame each call.
 * - 'auto' reports a verdict that agrees with this browser's renderer string:
 *   hardware on a GPU host, software under SwiftShader.
 * - 'off' (the default) runs the animation loop as before.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

const SIZE = 64
const DSL = 'search synth\nreactionDiffusion().write(o0)\nrender(o0)'
const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render driver|apple software renderer/i

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())

async function open(mode, preferWebGPU = false) {
    const page = await browser.newPage()
    const errors = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/shaders/effects/manifest.json`)
    await page.setContent(String.raw`<canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:${SIZE},height:${SIZE},
  basePath:'${base}/shaders',preferWebGPU:${preferWebGPU},softwareRendering:${JSON.stringify(mode)}});
await renderer.loadManifest();
await renderer.loadEffects(['synth/reactionDiffusion']);
await renderer.compile(${JSON.stringify(DSL)});
renderer.start();
window.renderer = renderer;
window.ready = true;
</script>`)
    await page.waitForFunction(() => window.ready === true)
    return { page, errors }
}

const state = (page) => page.evaluate(() => ({
    software: window.renderer.softwareRendering,
    backend: window.renderer.pipeline.backend.getName(),
    frameCount: window.renderer.frameCount,
    frameIndex: window.renderer.pipeline.frameIndex,
    running: window.renderer.isRunning
}))
const capture = (page) => page.evaluate(() => window.renderer.canvas.toDataURL())
const hash = (dataUrl) => crypto.createHash('sha256').update(dataUrl).digest('hex').slice(0, 12)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
    // 'on': one frame, no loop, WebGL2 even when WebGPU was preferred.
    {
        const { page, errors } = await open('on', true)
        let s = await state(page)
        assert.equal(s.software.active, true)
        assert.equal(s.backend, 'WebGL2')
        assert.equal(s.running, false)
        assert.equal(s.frameCount, 1, 'start() rendered one frame')
        await wait(400)
        s = await state(page)
        assert.equal(s.frameCount, 1, 'no animation loop ran')
        const first = await capture(page)
        const times = await page.evaluate(() => [window.renderer.stepFrame(), window.renderer.stepFrame(), window.renderer.stepFrame()])
        assert.deepEqual(times, [1 / 600, 2 / 600, 3 / 600], 'one 60 fps frame of a 10 s loop per step')
        s = await state(page)
        assert.equal(s.frameCount, 4)
        assert.equal(s.frameIndex, 4, 'the simulation stepped once per frame')
        const stepped = await capture(page)
        assert.notEqual(hash(stepped), hash(first), 'the simulation state advanced')
        await page.evaluate(() => window.renderer.switchBackend('wgsl'))
        s = await state(page)
        assert.equal(s.backend, 'WebGL2', 'switchBackend(wgsl) is refused')
        assert.deepEqual(errors, [], errors.join('\n'))
        console.log(`on: one frame without a loop; three steps to t=${times.at(-1).toFixed(6)}, frameIndex ${s.frameIndex}; WebGPU refused`)
        await page.close()
    }

    // 'auto': the verdict agrees with this browser's renderer string.
    {
        const { page, errors } = await open('auto')
        const s = await state(page)
        const report = s.software.report
        assert.equal(typeof report.renderer, 'string')
        const masked = !report.renderer || /^(webkit webgl|mozilla)$/i.test(report.renderer)
        const expected = SOFTWARE.test(report.renderer) || (masked && report.caveatProbe === 'failed')
        assert.equal(s.software.active, expected, JSON.stringify(report))
        assert.equal(s.running, !expected, 'the loop runs only on a hardware GPU')
        assert.deepEqual(errors, [], errors.join('\n'))
        console.log(`auto: active=${s.software.active} renderer="${report.renderer}" caveat=${report.caveatProbe}`)
        await page.close()
    }

    // 'off' (default): the animation loop runs as before, with no detection.
    {
        const { page, errors } = await open('off')
        await wait(400)
        const s = await state(page)
        assert.deepEqual(s.software, { mode: 'off', active: false, report: null })
        assert.equal(s.running, true)
        assert.ok(s.frameCount > 3, `the loop rendered ${s.frameCount} frames`)
        await page.evaluate(() => window.renderer.stop())
        assert.deepEqual(errors, [], errors.join('\n'))
        console.log(`off: loop ran ${s.frameCount} frames, no detection`)
        await page.close()
    }
    console.log('Software rendering mode: single frames on WebGL2 when active, unchanged loop when off')
} finally {
    await browser.close()
    await releaseServer()
}
