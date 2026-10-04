#!/usr/bin/env node
// Rendered regression for filter/octaveWarp (Refs #303).
//
// hash21() folded its inputs through ternary expressions converting floats to
// uint (`uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0)`). Reached from
// noise() inside the per-octave loop, that construct stalls GPU execution on
// ANGLE Metal (first readback only after ~73-98s, frame all-zero) and grows
// SwiftShader memory without bound on Linux (4 GiB cgroup OOM). This test
// renders a real octaveWarp program through CanvasRenderer on both backends
// in headless Chromium under a wall-clock deadline: before the fix the render
// misses the deadline (or dies with the OOM-killed GPU process); after the
// fix both backends render promptly, with a live (non-black, varying) frame,
// and stay pixel-identical to each other.
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
// SHADE_VIEWER_PORT pins the loopback port (the vendored harness reads the
// same variable); hosts that only permit fixed ports need it.
const baseUrl = await acquireServer(Number(process.env.SHADE_VIEWER_PORT) || undefined, repoRoot, effectsDir)
const browser = await chromium.launch(shaderTestBrowserOptions())

const WIDTH = 64
const HEIGHT = 48
// The fixed effect renders in well under a second (a filter/warp control
// renders in ~89-150ms on the same hosts where the unfixed one stalled for
// minutes); the deadline only exists to turn a GPU stall into a prompt,
// specific failure instead of a hung suite.
const RENDER_DEADLINE_MS = 90_000

const DSL = `search synth, filter

noise(type: 0).octaveWarp(octaves: 3, displacement: 0.2).write(o0)
render(o0)`

async function install(preferWebGPU) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    const errors = []
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
    await page.setContent(`<canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
const canvas = document.getElementById('canvas');
const renderer = new CanvasRenderer({canvas,width:${WIDTH},height:${HEIGHT},basePath:'${baseUrl}/shaders',preferWebGPU:${preferWebGPU}});
await renderer.loadManifest();
await renderer.loadEffects(['synth/noise','filter/octaveWarp']);
window.renderDsl = async dsl => {
    // The backends throw plain {code, detail} objects for shader errors;
    // rethrow as Error so the detail survives page.evaluate.
    try { await renderer.compile(dsl); }
    catch (e) { throw new Error(e instanceof Error ? e.message : JSON.stringify(e)); }
    renderer.render(0); renderer.render(0);
    const queue = renderer.pipeline?.backend?.device?.queue;
    if (queue?.onSubmittedWorkDone) await queue.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(),png:canvas.toDataURL('image/png')};
};
</script>`)
    await page.waitForFunction(() => typeof window.renderDsl === 'function')
    return { page, errors }
}

async function renderWithDeadline(page, label) {
    let timer
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${label}: render+readback did not complete within ${RENDER_DEADLINE_MS / 1000}s (GPU execution stall)`)),
            RENDER_DEADLINE_MS,
        )
    })
    try {
        return await Promise.race([page.evaluate(d => window.renderDsl(d), DSL), timeout])
    } finally {
        clearTimeout(timer)
    }
}

function frameStats(png) {
    let maxChannel = 0
    const colors = new Set()
    for (let i = 0; i < png.data.length; i += 4) {
        colors.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`)
        maxChannel = Math.max(maxChannel, png.data[i], png.data[i + 1], png.data[i + 2])
    }
    return { maxChannel, uniqueColors: colors.size }
}

const failures = []
const frames = new Map()
try {
    for (const [preferWebGPU, backend, backendLabel] of [[false, 'WebGL2', 'WebGL2'], [true, 'WebGPU', 'WebGPU']]) {
        const { page, errors } = await install(preferWebGPU)
        try {
            const result = await renderWithDeadline(page, `${backendLabel} first frame`)
            assert.equal(result.backend, backend, 'Backend fallback must not masquerade as the requested backend')
            const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
            const { maxChannel, uniqueColors } = frameStats(png)
            assert.ok(maxChannel > 0, `${backendLabel}: frame is all-black (the reported failure mode)`)
            assert.ok(uniqueColors >= 16, `${backendLabel}: frame must vary, got ${uniqueColors} unique colors`)
            assert.deepEqual(errors, [], `${backendLabel} browser errors`)
            frames.set(backendLabel, png.data)
            console.log(`PASS ${backendLabel.padEnd(7)} octaveWarp renders under deadline (${uniqueColors} unique colors)`)
        } catch (err) {
            failures.push(backendLabel)
            console.log(`FAIL ${backendLabel.padEnd(7)} octaveWarp: ${err.message}`)
        }
        await page.close()
    }

    const glsl = frames.get('WebGL2')
    const wgsl = frames.get('WebGPU')
    if (glsl && wgsl) {
        let max = 0
        for (let i = 0; i < glsl.length; i++) max = Math.max(max, Math.abs(glsl[i] - wgsl[i]))
        console.log(`${max === 0 ? 'PASS' : 'FAIL'} parity  octaveWarp: GLSL/WGSL maxDiff=${max}`)
        if (max !== 0) failures.push('parity')
    }
} finally {
    // A stalled GPU thread can keep browser cleanup hanging; bound it and
    // force-exit below so a red run ends promptly instead of hanging the suite.
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))])
    await Promise.race([releaseServer(), new Promise(resolve => setTimeout(resolve, 5000))])
}

if (failures.length) {
    console.error(`\noctaveWarp regression: ${failures.length} failure(s): ${failures.join(', ')}`)
    process.exit(1)
}
console.log('\nfilter/octaveWarp: renders on both backends under the deadline; exact GLSL/WGSL parity')
