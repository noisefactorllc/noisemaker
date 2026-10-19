#!/usr/bin/env node
// The documented ProgramState undo restores a snapshot whose program differs
// from the compiled one (GAP-026).
//
// Regression: serialize() and toDsl() read renderer.currentDsl, and
// deserialize() rebuilt the state from the snapshot without touching the
// renderer. After an undo across an added step, the state held program A's
// steps while toDsl(), the next serialize() and the pipeline all stayed on
// program B. deserialize() now makes the snapshot's program the renderer's
// current program and emits recompileNeeded; the host compiles state.toDsl(),
// as the Undo/Redo section of docs/shaders/integration.rst shows.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js'))

const programA = `search synth

noise(scaleX: 40)
  .write(o0)

render(o0)`

const programB = `search synth, filter

noise(scaleX: 40)
  .posterize()
  .write(o0)

render(o0)`

async function installHarness(page, baseUrl) {
    await page.setContent(`<!doctype html>
<meta charset="utf-8">
<canvas id="canvas" width="64" height="64"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
import { ProgramState } from '${baseUrl}/demo/shaders/lib/program-state.js';

const renderer = new CanvasRenderer({
    canvas: document.getElementById('canvas'),
    width: 64,
    height: 64,
    basePath: '${baseUrl}/shaders',
    preferWebGPU: false
});
await renderer.loadManifest();
await renderer.loadEffects(['synth/noise', 'filter/posterize']);
renderer.stop();

const state = new ProgramState({ renderer });
const undoStack = [];
const redoStack = [];
let recompiles = [];

// The Undo/Redo section of docs/shaders/integration.rst.
state.on('recompileNeeded', () => recompiles.push(renderer.compile(state.toDsl())));
function pushUndo() {
    undoStack.push(state.serialize());
    redoStack.length = 0;
}
function undo() {
    if (!undoStack.length) return;
    redoStack.push(state.serialize());
    state.deserialize(undoStack.pop());
}

const passes = () => renderer.pipeline.graph.passes.map((p) => p.effectKey);

window.loadProgram = async (dsl) => {
    await renderer.compile(dsl);
    state.fromDsl(dsl);
    return passes();
};
window.setScale = (value) => state.setValue('step_0', 'scaleX', value);
window.pushUndo = pushUndo;
window.undo = async () => {
    recompiles = [];
    undo();
    await Promise.all(recompiles);
    const saved = state.serialize();
    return {
        recompiles: recompiles.length,
        toDsl: state.toDsl(),
        savedDsl: saved.dsl,
        stepKeys: Object.keys(saved.stepStates).sort(),
        scaleX: state.getValue('step_0', 'scaleX'),
        passes: passes()
    };
};
window.stepKeys = () => Object.keys(state.serialize().stepStates).sort();
</script>`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.undo === 'function', null, { timeout: 30000 })
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
    const errors = []

    try {
        const page = await browser.newPage()
        page.setDefaultTimeout(30000)
        page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(`[error] ${message.text()}`)
        })
        await installHarness(page, baseUrl)

        // Program A, with a value changed after load, is the undo snapshot.
        const passesA = await page.evaluate((dsl) => window.loadProgram(dsl), programA)
        await page.evaluate(() => window.setScale(55))
        const keysA = await page.evaluate(() => window.stepKeys())
        await page.evaluate(() => window.pushUndo())

        const passesB = await page.evaluate((dsl) => window.loadProgram(dsl), programB)
        assert.ok(passesB.includes('filter.posterize'), `program B compiles posterize: ${passesB}`)

        const restored = await page.evaluate(() => window.undo())
        console.log(JSON.stringify(restored))

        assert.equal(restored.recompiles, 1, 'undo across a structure change asks for one recompile')
        assert.ok(!restored.toDsl.includes('posterize'), `toDsl() describes program A:\n${restored.toDsl}`)
        assert.ok(!restored.savedDsl.includes('posterize'), `serialize().dsl describes program A:\n${restored.savedDsl}`)
        assert.deepEqual(restored.stepKeys, keysA, 'serialize().stepStates has the step keys of program A')
        assert.equal(restored.scaleX, 55, 'the snapshot value of program A is restored')
        assert.deepEqual(restored.passes, passesA, 'the pipeline runs the passes of program A')
        assert.deepEqual(errors, [], `page errors:\n${errors.join('\n')}`)

        console.log('PASS ProgramState undo restores the program of the snapshot')
    } finally {
        await browser.close()
        await releaseServer()
    }
}

await main()
