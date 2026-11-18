#!/usr/bin/env node
// A hot recompile whose shader the backend rejects keeps the accepted program
// running. CanvasRenderer._compile() states that a rejected compile keeps the
// previous pipeline. Before the fix, recompile() swapped in the candidate
// graph before its shaders compiled: the rejection kept currentDsl but left
// the candidate graph in place, so every later render() reported
// ERR_PROGRAM_NOT_FOUND, the frame counter stopped, and the canvas froze.
//
// For each backend: compile and render program A (red), reject program B (A
// plus a tint step whose shader is invalid, a structural edit), then check
// that the graph and currentDsl still describe A, that later frames render A
// with no error, and that a later valid compile (blue) succeeds.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(pathToFileURL(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js')).href)

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--backend' && ['webgl2', 'webgpu'].includes(args[1])),
    'usage: test_rejected_shader_recompile.mjs [--backend webgl2|webgpu]')
const requestedBackends = args.length ? [args[1]] : ['webgl2', 'webgpu']

const SIZE = 64
const ACCEPTED = 'search synth\nsolid(color: #ff0000).write(o0)\nrender(o0)'
const REJECTED = 'search synth, filter\nsolid(color: #0000ff).tint().write(o0)\nrender(o0)'
const LATER = 'search synth\nsolid(color: #0000ff).write(o0)\nrender(o0)'
// Step 1 is the tint step; its colorize program does not compile.
const INVALID_TINT = { 1: { colorize: { glsl: '#version 300 es\nthis is invalid', wgsl: 'this is invalid' } } }

async function installHarness(page, baseUrl, preferWebGPU) {
    await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; overflow: hidden; background: black; }
canvas#canvas { display: block; width: ${SIZE}px; height: ${SIZE}px; }
</style>
<canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';

window.renderErrors = [];
const renderer = new CanvasRenderer({
    canvas: document.getElementById('canvas'),
    width: ${SIZE},
    height: ${SIZE},
    basePath: '${baseUrl}/shaders',
    preferWebGPU: ${preferWebGPU ? 'true' : 'false'},
    onError: (error) => window.renderErrors.push(error?.code ?? String(error))
});
await renderer.loadManifest();
await renderer.loadEffects(['synth/solid', 'filter/tint']);
renderer.stop();

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
window.backendName = () => renderer.pipeline?.backend?.getName?.() || 'unknown';
window.state = () => ({
    effectKeys: renderer.pipeline?.graph?.passes?.map((pass) => pass.effectKey ?? null) ?? null,
    currentDsl: renderer.currentDsl,
    frameCount: renderer.frameCount,
    errors: [...window.renderErrors]
});
window.compileDsl = async (dsl, shaderOverrides) => {
    try {
        await renderer.compile(dsl, shaderOverrides ? { shaderOverrides } : {});
        return { ok: true, backend: window.backendName() };
    } catch (error) {
        return { ok: false, code: error?.code ?? String(error) };
    }
};
window.renderFrames = async (count) => {
    for (let i = 0; i < count; i++) {
        renderer.render(i / 60);
        await frame();
    }
};
</script>`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.compileDsl === 'function', null, { timeout: 30000 })
}

async function centre(page) {
    const png = PNG.sync.read(await (await page.$('canvas#canvas')).screenshot({ type: 'png' }))
    const i = ((png.height >> 1) * png.width + (png.width >> 1)) * 4
    return [png.data[i], png.data[i + 1], png.data[i + 2]]
}

const isRed = ([r, g, b]) => r > 200 && g < 40 && b < 40
const isBlue = ([r, g, b]) => r < 40 && g < 40 && b > 200

async function runBackend(browser, baseUrl, { preferWebGPU, expectedName }) {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
    page.setDefaultTimeout(30000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
        // about:blank has no trustworthy origin and silently denies WebGPU.
        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
        await installHarness(page, baseUrl, preferWebGPU)

        const accepted = await page.evaluate((dsl) => window.compileDsl(dsl), ACCEPTED)
        assert.deepEqual(accepted, { ok: true, backend: expectedName }, 'program A compiles on the requested backend')
        await page.evaluate(() => window.renderFrames(3))
        const before = await page.evaluate(() => window.state())
        assert.ok(isRed(await centre(page)), `${expectedName}: program A renders red`)

        const rejected = await page.evaluate(([dsl, overrides]) => window.compileDsl(dsl, overrides), [REJECTED, INVALID_TINT])
        assert.deepEqual(rejected, { ok: false, code: 'ERR_SHADER_COMPILE' }, `${expectedName}: the invalid tint shader is rejected`)

        const afterRejection = await page.evaluate(() => window.state())
        assert.deepEqual(afterRejection.effectKeys, before.effectKeys, `${expectedName}: the graph still describes program A`)
        assert.equal(afterRejection.currentDsl, ACCEPTED, `${expectedName}: currentDsl still names program A`)

        await page.evaluate(() => window.renderFrames(5))
        const rendered = await page.evaluate(() => window.state())
        assert.equal(rendered.frameCount, afterRejection.frameCount + 5, `${expectedName}: later frames advance the frame counter`)
        assert.deepEqual(rendered.errors, [], `${expectedName}: later frames report no error`)
        assert.ok(isRed(await centre(page)), `${expectedName}: the canvas still shows program A`)

        const later = await page.evaluate((dsl) => window.compileDsl(dsl), LATER)
        assert.deepEqual(later, { ok: true, backend: expectedName }, `${expectedName}: a later valid compile succeeds`)
        await page.evaluate(() => window.renderFrames(3))
        const final = await page.evaluate(() => window.state())
        assert.equal(final.currentDsl, LATER)
        assert.deepEqual(final.errors, [], `${expectedName}: the later program renders with no error`)
        assert.ok(isBlue(await centre(page)), `${expectedName}: the later program renders blue`)

        assert.deepEqual(pageErrors, [], `${expectedName}: page errors`)
        console.log(`${expectedName}: rejection kept program A (${before.effectKeys.filter(Boolean).join(', ')}), ` +
            `frames ${afterRejection.frameCount} -> ${rendered.frameCount}, later compile rendered blue`)
        return expectedName
    } finally {
        await page.close()
    }
}

async function main() {
    const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
    const browser = await chromium.launch(shaderTestBrowserOptions())
    try {
        const ran = []
        for (const backend of requestedBackends) {
            const expectedName = backend === 'webgpu' ? 'WebGPU' : 'WebGL2'
            ran.push(await runBackend(browser, baseUrl, { preferWebGPU: backend === 'webgpu', expectedName }))
        }
        assert.equal(ran.length, requestedBackends.length, 'every requested backend must execute')
        console.log(`PASS test_rejected_shader_recompile (${ran.join(', ')})`)
    } finally {
        await browser.close()
        await releaseServer()
    }
}

await main()
