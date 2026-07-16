#!/usr/bin/env node
// Async-overlay effects (asyncInit CPU textures: filter/fibers, scratches,
// strayHair) must render after a HOT RECOMPILE, not just on first compile.
//
// Regression: initAsyncEffects() only ran from pipeline.resize() — reached via
// createPipeline() on first compile — while recompile() swapped the graph and
// recreated (empty) overlay textures without ever re-rendering them. Any
// program that gained an asyncInit effect via hot recompile blended a blank
// overlay and silently passed its input through unchanged. Layers hit this on
// every "add fibers layer" action; the effect looked like a dead control.
//
// Also guards checkAsyncRegen wiring in applyStepParameterValues: changing a
// non-alpha param (seed) through the engine's step-param path must re-render
// the overlay with the new value.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js'))

const width = 128
const height = 128

const BASE_HEX = 0x40 // #404040 solid base

const solidOnlyDsl = `search synth

solid(color: #404040)
  .write(o0)

render(o0)`

const fibersDsl = `search synth, filter

solid(color: #404040)
  .fibers(density: 1, alpha: 1, seed: 1)
  .write(o0)

render(o0)`

// Fraction of pixels deviating from the solid base color by more than 16 on
// any RGB channel. Worm strands are colored (55-255 per channel), so visible
// fibers push this well above zero; a blank overlay leaves it at ~0.
function deviatingFraction(png) {
    let deviating = 0
    const pixels = png.width * png.height
    for (let i = 0; i < png.data.length; i += 4) {
        const d = Math.max(
            Math.abs(png.data[i] - BASE_HEX),
            Math.abs(png.data[i + 1] - BASE_HEX),
            Math.abs(png.data[i + 2] - BASE_HEX))
        if (d > 16) deviating++
    }
    return deviating / pixels
}

function meanAbsDiff(a, b) {
    assert.equal(a.data.length, b.data.length)
    let sum = 0
    for (let i = 0; i < a.data.length; i += 4) {
        sum += Math.abs(a.data[i] - b.data[i])
        sum += Math.abs(a.data[i + 1] - b.data[i + 1])
        sum += Math.abs(a.data[i + 2] - b.data[i + 2])
    }
    return sum / (a.data.length * 3 / 4)
}

async function installHarness(page, baseUrl) {
    await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: black; }
canvas { display: block; width: ${width}px; height: ${height}px; }
</style>
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';

const canvas = document.getElementById('canvas');
const renderer = new CanvasRenderer({
    canvas,
    width: ${width},
    height: ${height},
    basePath: '${baseUrl}/shaders',
    preferWebGPU: false
});
await renderer.loadManifest();
await renderer.loadEffects(['synth/solid', 'filter/fibers']);

window.compileDsl = async (dsl) => {
    await renderer.compile(dsl);
    renderer.stop();
    renderer.render(0);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return renderer.pipeline?.backend?.getName?.() || 'unknown';
};
window.renderFrame = async () => {
    renderer.render(0);
    await new Promise((resolve) => requestAnimationFrame(resolve));
};
window.applyFibersParams = (params) => {
    const pass = renderer.pipeline?.graph?.passes?.find(
        (p) => p.effectKey === 'filter.fibers');
    if (!pass || pass.stepIndex === undefined) return null;
    renderer.applyStepParameterValues({ ['step_' + pass.stepIndex]: params });
    return pass.stepIndex;
};
</script>`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.compileDsl === 'function', null, { timeout: 30000 })
}

async function screenshotPng(page) {
    const handle = await page.$('canvas')
    if (!handle) throw new Error('test canvas not found')
    return PNG.sync.read(await handle.screenshot({ type: 'png' }))
}

// Worm tracing is async (fire-and-forget with progressive uploads); poll
// until the predicate holds or the deadline passes, re-rendering each tick.
async function pollUntil(page, predicate, label, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    let last = null
    for (;;) {
        await page.evaluate(() => window.renderFrame())
        last = await screenshotPng(page)
        if (predicate(last)) return last
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for ${label}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
}

// Like pollUntil, but after the predicate first holds, keep polling until two
// consecutive frames are pixel-stable. Overlay uploads are progressive
// (onProgress), so a threshold-crossing frame may still be mid-trace; a
// baseline snapshotted there would weaken later change-detection assertions.
async function pollUntilStable(page, predicate, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs
    let prev = await pollUntil(page, predicate, label, timeoutMs)
    for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        await page.evaluate(() => window.renderFrame())
        const current = await screenshotPng(page)
        if (predicate(current) && meanAbsDiff(current, prev) < 0.25) return current
        prev = current
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for stable ${label}`)
        }
    }
}

async function newHarnessPage(browser, baseUrl, consoleMessages) {
    const page = await browser.newPage({ viewport: { width, height } })
    page.setDefaultTimeout(30000)
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
            const text = message.text()
            if (message.type() === 'warning' && text.includes('GL Driver Message (OpenGL, Performance')) {
                return
            }
            consoleMessages.push(`[${message.type()}] ${text}`)
        }
    })
    page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`))
    await installHarness(page, baseUrl)
    return page
}

async function main() {
    const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-gpu-sandbox',
            process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=egl',
        ],
    })
    const consoleMessages = []

    try {
        // --- Case 1: first compile (createPipeline path) renders the overlay.
        const firstPage = await newHarnessPage(browser, baseUrl, consoleMessages)
        assert.equal(await firstPage.evaluate((dsl) => window.compileDsl(dsl), fibersDsl), 'WebGL2')
        const firstCompile = await pollUntil(firstPage,
            (png) => deviatingFraction(png) > 0.01,
            'fibers on FIRST compile')
        console.log(`first compile: deviating=${(deviatingFraction(firstCompile) * 100).toFixed(2)}%`)
        await firstPage.close()

        // --- Case 2: hot recompile (the regression) renders the overlay.
        const page = await newHarnessPage(browser, baseUrl, consoleMessages)
        assert.equal(await page.evaluate((dsl) => window.compileDsl(dsl), solidOnlyDsl), 'WebGL2')
        const solidPng = await screenshotPng(page)
        assert.ok(deviatingFraction(solidPng) < 0.001,
            `solid-only base must render flat #404040 (deviating=${deviatingFraction(solidPng)})`)

        assert.equal(await page.evaluate((dsl) => window.compileDsl(dsl), fibersDsl), 'WebGL2')
        const recompiled = await pollUntilStable(page,
            (png) => deviatingFraction(png) > 0.01,
            'fibers after HOT RECOMPILE (initAsyncEffects must run from recompile())')
        console.log(`recompile: deviating=${(deviatingFraction(recompiled) * 100).toFixed(2)}%`)

        // --- Case 3: seed change via applyStepParameterValues re-renders the
        // overlay with a different worm layout (checkAsyncRegen wiring).
        const stepIndex = await page.evaluate(() =>
            window.applyFibersParams({ seed: 7, density: 1, alpha: 1 }))
        assert.notEqual(stepIndex, null, 'fibers pass with stepIndex not found in graph')
        const reseeded = await pollUntil(page,
            (png) => deviatingFraction(png) > 0.01 && meanAbsDiff(png, recompiled) > 2,
            'fibers re-render after seed change via applyStepParameterValues')
        console.log(`reseed: deviating=${(deviatingFraction(reseeded) * 100).toFixed(2)}%, ` +
            `meanAbsDiff=${meanAbsDiff(reseeded, recompiled).toFixed(2)}`)
        await page.close()

        assert.deepEqual(consoleMessages, [],
            `console output:\n${consoleMessages.join('\n')}`)
        console.log('PASS test_async_overlay_recompile')
    } finally {
        await browser.close()
        await releaseServer()
    }
}

await main()
