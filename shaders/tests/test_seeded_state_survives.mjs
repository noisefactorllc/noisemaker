#!/usr/bin/env node
// A reseed that changes structure recompiles the program, and live state keyed
// by an `_id:` survives it, on each backend: an element at the top level, and
// an element inside a part instance, keyed by its use path. The undo of the
// reseed recompiles again and the state survives that too. The state is read
// through backend.readPixels before and after each recompile, with no frame
// drawn between them.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { chanceFrom, drawU32 } from '../src/lang/draws.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(pathToFileURL(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js')).href)

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--backend' && ['webgl2', 'webgpu'].includes(args[1])),
    'usage: test_seeded_state_survives.mjs [--backend webgl2|webgpu]')
const requestedBackends = args.length ? [args[1]] : ['webgl2', 'webgpu']

const SIZE = 64
const EFFECTS = ['synth/noise', 'synth/reactionDiffusion', 'mixer/blendMode', 'filter/feedback', 'filter/invert']
const program = seed => `search synth, mixer, filter
seed ${seed}

part fb {
  .feedback(_id: "loop")
}

noise(scaleY: rand(1, 10))
maybe(0.5) {
  .invert()
}
.blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4))
.use(fb, _id: "a")
.write(o0)

render(o0)`

// Two seeds that take the maybe block differently.
const taken = seed => chanceFrom(drawU32(seed, 'maybe_1/decide'), 0.5)
const FIRST = 0
let SECOND = 1
while (taken(SECOND) === taken(FIRST)) SECOND++

const STATES = [['pond', 'global_rd_state'], ['a/loop', '_selfTex']]

async function installHarness(page, baseUrl, preferWebGPU) {
    await page.setContent(`<!doctype html>
<meta charset="utf-8">
<canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
import { ProgramState } from '${baseUrl}/demo/shaders/lib/program-state.js';

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

const state = new ProgramState({ renderer });
let recompiles = [];
// The host's recompile handler, as in docs/shaders/integration.rst.
state.on('recompileNeeded', () => recompiles.push(renderer.compile(state.toDsl())));

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
window.backendName = () => renderer.pipeline?.backend?.getName?.() || 'unknown';
window.passes = () => renderer.pipeline.graph.passes.map((pass) => pass.effectKey);
window.load = async (dsl) => {
    await renderer.compile(dsl);
    state.fromDsl(dsl);
    return window.backendName();
};
window.renderFrames = async (count) => {
    for (let i = 0; i < count; i++) {
        renderer.render(i / 60);
        await frame();
    }
};
// Run a ProgramState edit and wait for the recompiles it asks for.
const edit = async (fn) => {
    recompiles = [];
    fn();
    await Promise.all(recompiles);
    return { recompiles: recompiles.length, seed: state.getSeed(), passes: window.passes() };
};
let snapshot = null;
window.setSeed = (seed) => edit(() => { snapshot = state.serialize(); state.setSeed(seed); });
window.undo = () => edit(() => state.deserialize(snapshot));
window.keyOf = (id, name) => renderer.keyOf(id, name);
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
    await page.waitForFunction(() => typeof window.load === 'function', null, { timeout: 30000 })
}

const keysOf = page => page.evaluate((states) => states.map(([id, name]) => window.keyOf(id, name)), STATES)
const readAll = (page, keys) => page.evaluate(async (stateKeys) => Promise.all(stateKeys.map((key) => window.readState(key))), keys)

async function runBackend(browser, baseUrl, { preferWebGPU, expectedName }) {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
    page.setDefaultTimeout(60000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
        // about:blank has no trustworthy origin and silently denies WebGPU.
        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
        await installHarness(page, baseUrl, preferWebGPU)

        assert.equal(await page.evaluate((dsl) => window.load(dsl), program(FIRST)), expectedName)
        const passesBefore = await page.evaluate(() => window.passes())
        await page.evaluate(() => window.renderFrames(12))
        const keys = await keysOf(page)
        assert.ok(keys.every(Boolean), `${expectedName}: keyOf() names both states: ${keys.join(', ')}`)
        assert.ok(keys[1].startsWith('id_a/loop@'), `${expectedName}: the state in the part instance is keyed by its use path: ${keys[1]}`)
        const before = await readAll(page, keys)
        for (const [index, digests] of before.entries()) {
            assert.ok(digests && digests.every((digest) => digest.nonzero > 0), `${expectedName}: ${keys[index]} holds state before the reseed`)
        }

        const reseeded = await page.evaluate((seed) => window.setSeed(seed), SECOND)
        assert.equal(reseeded.seed, SECOND)
        assert.equal(reseeded.recompiles, 1, `${expectedName}: the reseed that changes structure recompiles once`)
        assert.notDeepEqual(reseeded.passes, passesBefore, `${expectedName}: the reseed changed the passes`)
        assert.deepEqual(await keysOf(page), keys, `${expectedName}: the keys do not change with the reseed`)
        assert.deepEqual(await readAll(page, keys), before, `${expectedName}: the state survives the reseed`)
        console.log(`${expectedName}: seed ${FIRST} to ${SECOND}: ${keys.join(' and ')} kept their state`)

        await page.evaluate(() => window.renderFrames(4))
        const held = await readAll(page, keys)
        const undone = await page.evaluate(() => window.undo())
        assert.equal(undone.seed, FIRST, `${expectedName}: the undo restores the seed`)
        assert.equal(undone.recompiles, 1, `${expectedName}: the undo of the reseed recompiles once`)
        assert.deepEqual(undone.passes, passesBefore, `${expectedName}: the undo restores the passes`)
        assert.deepEqual(await keysOf(page), keys, `${expectedName}: the keys do not change with the undo`)
        assert.deepEqual(await readAll(page, keys), held, `${expectedName}: the state survives the undo`)
        console.log(`${expectedName}: the undo to seed ${FIRST} kept the state`)

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
        console.log(`PASS test_seeded_state_survives (${ran.join(', ')})`)
    } finally {
        await browser.close()
        await releaseServer()
    }
}

await main()
