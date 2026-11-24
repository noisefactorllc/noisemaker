#!/usr/bin/env node
// An element with an `_id:` keeps its state across a recompile that inserts,
// deletes or reorders other elements, on each backend. The state is read
// through backend.readPixels before and after each edit, with no frame drawn
// between them. A control without an `_id:` shows that the same edit moves
// unnamed state to a new key.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(pathToFileURL(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js')).href)

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--backend' && ['webgl2', 'webgpu'].includes(args[1])),
    'usage: test_element_state_survives.mjs [--backend webgl2|webgpu]')
const requestedBackends = args.length ? [args[1]] : ['webgl2', 'webgpu']

const SIZE = 64
const EFFECTS = ['synth/perlin', 'synth/noise', 'synth/solid', 'synth/reactionDiffusion', 'mixer/blendMode', 'filter/feedback', 'filter/invert', 'filter/fibers']
const program = body => `search synth, mixer, filter\n${body}\nrender(o0)`
const BASE = 'perlin().write(o1)\nnoise().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).feedback(_id: "loop").write(o0)'
const EDITS = {
    'a chain is inserted before its chain': `solid(color: #ff0000).write(o2)\n${BASE}`,
    'an effect is inserted before it': 'perlin().write(o1)\nnoise().invert().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).invert().feedback(_id: "loop").write(o0)',
    'an earlier chain is deleted': 'noise().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).feedback(_id: "loop").write(o0)',
    'the chains are reordered': 'noise().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).feedback(_id: "loop").write(o0)\nperlin().write(o1)'
}
const CONTROL = 'reactionDiffusion(zoom: x4).write(o0)'
const CONTROL_EDIT = `perlin().write(o1)\n${CONTROL}`

async function installHarness(page, baseUrl, preferWebGPU) {
    await page.setContent(`<!doctype html>
<meta charset="utf-8">
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
await renderer.loadEffects(${JSON.stringify(EFFECTS)});
renderer.stop();

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
window.backendName = () => renderer.pipeline?.backend?.getName?.() || 'unknown';
window.compileDsl = async (dsl) => {
    try {
        await renderer.compile(dsl);
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
window.keyOf = (id, name) => renderer.keyOf(id, name);
window.moveState = (from, to) => renderer.moveState(from, to);
// A digest of the texture that holds a state key: both halves of a state
// surface, or a node-local texture, read through backend.readPixels.
window.readState = async (key) => {
    const pipeline = renderer.pipeline;
    const ids = key.startsWith('global_')
        ? (() => { const surface = pipeline.surfaces.get(key.slice('global_'.length)); return surface ? [surface.read, surface.write] : [] })()
        : [key];
    if (ids.length === 0) return null;
    const digests = [];
    for (const id of ids) {
        const pixels = await pipeline.backend.readPixels(id);
        if (!pixels?.data) return null;
        const data = pixels.data;
        let hash = 2166136261 >>> 0;
        let nonzero = 0;
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        for (let i = 0; i < bytes.length; i++) {
            hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0;
            if (bytes[i] !== 0) nonzero++;
        }
        digests.push({ width: pixels.width, height: pixels.height, bytes: bytes.length, hash, nonzero });
    }
    return digests;
};
</script>`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.compileDsl === 'function', null, { timeout: 30000 })
}

async function compile(page, dsl, expectedName) {
    const result = await page.evaluate((source) => window.compileDsl(source), dsl)
    assert.deepEqual(result, { ok: true, backend: expectedName }, `${expectedName}: ${dsl.split('\n').slice(1, -1).join(' | ')} compiles`)
}

async function runBackend(browser, baseUrl, { preferWebGPU, expectedName }) {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
    page.setDefaultTimeout(60000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
        // about:blank has no trustworthy origin and silently denies WebGPU.
        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
        await installHarness(page, baseUrl, preferWebGPU)

        for (const [edit, body] of Object.entries(EDITS)) {
            await compile(page, program(BASE), expectedName)
            await page.evaluate(() => window.renderFrames(12))
            const keys = await page.evaluate(() => [window.keyOf('pond', 'global_rd_state'), window.keyOf('loop', '_selfTex')])
            assert.ok(keys[0] && keys[1], `${expectedName}: keyOf() names both states`)
            const before = await page.evaluate(async (stateKeys) => Promise.all(stateKeys.map((key) => window.readState(key))), keys)
            for (const [index, digests] of before.entries()) {
                assert.ok(digests && digests.every((digest) => digest.nonzero > 0), `${expectedName}: ${keys[index]} holds state before the edit`)
            }

            await compile(page, program(body), expectedName)
            const afterKeys = await page.evaluate(() => [window.keyOf('pond', 'global_rd_state'), window.keyOf('loop', '_selfTex')])
            assert.deepEqual(afterKeys, keys, `${expectedName}: the keys do not change when ${edit}`)
            const after = await page.evaluate(async (stateKeys) => Promise.all(stateKeys.map((key) => window.readState(key))), keys)
            assert.deepEqual(after, before, `${expectedName}: the state survives when ${edit}`)
            await page.evaluate(() => window.renderFrames(2))
            console.log(`${expectedName}: ${edit}: ${keys.join(' and ')} kept their state`)
        }

        // The rename action: the old key is read before the program changes,
        // and moveState() carries its live state to the new key.
        await compile(page, program(BASE), expectedName)
        await page.evaluate(() => window.renderFrames(12))
        const from = await page.evaluate(() => window.keyOf('pond', 'global_rd_state'))
        const held = await page.evaluate((key) => window.readState(key), from)
        await compile(page, program(BASE.replace('"pond"', '"lake"')), expectedName)
        const to = await page.evaluate(() => window.keyOf('lake', 'global_rd_state'))
        assert.ok(to && to !== from, `${expectedName}: the renamed element has a key of its own`)
        assert.equal(await page.evaluate(([a, b]) => window.moveState(a, b), [from, to]), true, `${expectedName}: moveState() moves the state`)
        assert.deepEqual(await page.evaluate((key) => window.readState(key), to), held, `${expectedName}: the renamed element holds the moved state`)
        console.log(`${expectedName}: moveState() carried ${from} to ${to}`)

        // An overlay effect draws into its element-keyed texture.
        await compile(page, program('noise().fibers(_id: "f").write(o0)'), expectedName)
        const overlay = await page.evaluate(() => window.keyOf('f', 'overlayTex'))
        assert.ok(overlay, `${expectedName}: keyOf() names the overlay`)
        await page.waitForFunction(async (key) => {
            const digests = await window.readState(key)
            return Boolean(digests && digests.every((digest) => digest.nonzero > 0))
        }, overlay, { timeout: 30000, polling: 250 })
        console.log(`${expectedName}: the overlay is drawn into ${overlay}`)

        // The control: the same kind of edit moves unnamed state to a new key.
        await compile(page, program(CONTROL), expectedName)
        await page.evaluate(() => window.renderFrames(12))
        const unnamed = await page.evaluate(() => window.readState('global_rd_state_chain_0'))
        assert.ok(unnamed && unnamed.every((digest) => digest.nonzero > 0), `${expectedName}: the unnamed state is allocated and holds state`)
        await compile(page, program(CONTROL_EDIT), expectedName)
        const moved = await page.evaluate(() => window.readState('global_rd_state_chain_1'))
        assert.ok(moved, `${expectedName}: the inserted chain gives the unnamed state a new key`)
        assert.notDeepEqual(moved, unnamed, `${expectedName}: without _id: the inserted chain moves the state to a new, fresh key`)

        const errors = await page.evaluate(() => window.renderErrors)
        assert.deepEqual(errors, [], `${expectedName}: render errors`)
        assert.deepEqual(pageErrors, [], `${expectedName}: page errors`)
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
        console.log(`PASS test_element_state_survives (${ran.join(', ')})`)
    } finally {
        await browser.close()
        await releaseServer()
    }
}

await main()
