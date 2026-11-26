#!/usr/bin/env node
/*
 * Record WebGL2 and WebGPU parity evidence for one effect.
 *
 *   node scripts/attest-shader-parity.mjs <namespace/effect> [--write]
 *
 * The recorder reads shaders/effects/<namespace>/<effect>/parity-case.json and
 * renders it in headless Chromium on both backends. It fails unless:
 *   - both frames show color (the empty frame gate);
 *   - every channel of every pixel matches (epsilon 0);
 *   - a case with a control renders a different frame from its control.
 * With --write it writes parity-attestation.json beside the case. The
 * verifier (scripts/verify-shader-parity-attestations.mjs) checks that file
 * against the case without rendering.
 *
 * The case fields. The validator (validateParityCase in
 * scripts/lib/shader-parity-attestation.mjs) refuses any other field.
 *   schemaVersion          1
 *   effects                the effect IDs the page loads. It includes the
 *                          target, and every effect the dsl or the control uses.
 *   dsl                    the program. Its target passes must execute.
 *   surface                the surface to read, for example "o0"
 *   resolution             [width, height]
 *   epsilon                0
 *   requireColorVariation  true
 *   settleMs               optional: an integer from 0 to 60000. The recorder
 *                          reads until two reads match, up to this time.
 *   tiles                  optional: { size: [w, h], renderScale }, a tiled
 *                          render. size divides resolution into at least two
 *                          tiles, and renderScale, if given, is above 0.
 *   textureInputs          optional: [{ effect, uniform, width, height, data,
 *                          afterFrame }]. effect is listed in effects, and
 *                          uniform is an identifier. data holds width * height
 *                          RGBA bytes from 0 to 255, and width and height are 1
 *                          to 64. The texture goes to each executing pass of the
 *                          effect that binds the uniform, and the recorder fails
 *                          if there is none. afterFrame is for timed cases only.
 *   meshInputs             optional: [{ mesh: "mesh0".."mesh7",
 *                          path: "share/meshes/<name>.obj" }], loaded after
 *                          the first frame
 *   timeline               optional: { frames, loopSeconds }. It makes a timed case.
 *   control                a DSL program. A timed case needs one, and an
 *                          untimed case may have one.
 *   midiMessages           optional, timed cases only: a non-empty array of
 *                          { afterFrame, data }
 *   midiInputs             optional, untimed cases only: [{ effect, notes:
 *                          [{ channel 1-16, key, velocity }] }], fed before
 *                          the first render
 *
 * Both MIDI forms send their notes as note-on messages, so every reader of the
 * MIDI state sees them. An untimed case's notes all go into one MIDI state at
 * the fixed time 0 (feedMidiInputs). A timed case's notes take the time they
 * arrive, so a midi() binding in a mode that decays from a note's time
 * (velocity or trigger) depends on when the page renders; a timed case should
 * show notes through the note grid, as synth/roll does.
 *
 * An untimed case feeds its midiInputs, renders once at time 0, then uploads
 * its textures and loads its meshes, then captures. Its attestation never has a timeline block, and
 * has a control block only if the case has a control.
 *
 * A timed case steps the 2.x fixed-step simulation clock
 * (shaders/src/runtime/simulation-clock.js):
 *   - loopSeconds is above 0 and at most 600, and defaults to 10. A loop holds
 *     N = max(1, round(60 * loopSeconds)) grid steps.
 *   - frames lists grid steps. It starts at 0, rises strictly, stays below N,
 *     and holds at least two frames. No two neighbouring frames are more than
 *     K = min(30, ceil(N / 2)) steps apart, because a longer jump re-anchors
 *     the clock instead of stepping it.
 *   - The recorder renders frame k at loop time k / N, in order. Each render
 *     runs every simulation step after the previous frame, so frames [0, 10]
 *     run the same simulation steps as frames 0 to 10. Draw passes and input
 *     uploads run once per stated frame, so the two need not render the same.
 *     A first render at time 0 runs one step.
 *   - After each frame it uploads the textureInputs whose afterFrame is that
 *     frame (default: the first frame). It sends the midiMessages whose
 *     afterFrame is that frame. afterFrame must be one of the frames.
 *   - It captures at the last frame. The capture renders at that time again,
 *     which runs no simulation step.
 *
 * A midiMessages entry's data is one MIDI message, which goes to the engine's
 * MIDI state. Before every frame the pipeline packs the held notes (note on
 * and note off) into the midiNoteGrid texture, as velocity and gate. The other
 * messages change the MIDI state that automation reads, but not that texture,
 * and a clock message counts into the midiClockCount uniform. Allowed messages:
 *   - note off 0x8n, note on 0x9n, polyphonic pressure 0xAn, control change
 *     0xBn or pitch bend 0xEn, each with two data bytes;
 *   - channel pressure 0xDn with one data byte;
 *   - clock 0xF8 alone.
 * n is the channel minus one, and each data byte is 0 to 127. A note on with
 * velocity 0 is a note off.
 *
 * The control is the case with the target's contribution disabled. It differs
 * from dsl, and it renders with the same timeline and inputs:
 *   - A timed control disables the target's time-dependence, for example
 *     every delay at 0. It must still run the target.
 *   - A producer seen through its consumer may use a control that replaces the
 *     producer with an empty input, such as read(o1).
 *   - A control may use only the effects that the case lists.
 *   - The control render uploads the same textureInputs, so each fixture's
 *     effect must still execute in the control. A producer control can replace
 *     the producer only when no fixture targets it.
 *   - The control must give a different frame from the case on both backends,
 *     or the recorder fails with CONTROL GATE FAILED.
 *   - The gate cannot see whether the control changes only the target's
 *     time-dependence. A control that also changes a seed passes it, so the
 *     case's author and reviewer check that the control disables only the target.
 *
 * Example: a timed case for a history effect. It renders a moving source
 * through the effect until its longest delay fills, with a control that sets
 * every delay to 0:
 *   {
 *     "schemaVersion": 1,
 *     "effects": ["synth/noise", "filter/temporalAberration"],
 *     "dsl": "search synth, filter\nnoise(seed: 1).temporalAberration(redDelay: 0, greenDelay: 4, blueDelay: 8).write(o0)\nrender(o0)",
 *     "surface": "o0",
 *     "resolution": [64, 64],
 *     "epsilon": 0,
 *     "requireColorVariation": true,
 *     "timeline": { "frames": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
 *     "control": "search synth, filter\nnoise(seed: 1).temporalAberration(redDelay: 0, greenDelay: 0, blueDelay: 0).write(o0)\nrender(o0)"
 *   }
 *
 * A timed case's attestation adds timeline: { frames, loopSeconds }. A case
 * with a control adds control: { differs: { webgl2, webgpu },
 * targetPasses: { webgl2, webgpu } }.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from './lib/shader-test-browser.mjs'

import {
    comparePixelFrames,
    computeFileHash,
    computeParitySourceHash,
    effectDirectory,
    feedMidiInputs,
    isReadbackPerformanceWarning,
    matchesTargetEffectPass,
    midiNoteOnMessages,
    PARITY_ATTESTATION_SCHEMA_VERSION,
    TIMELINE_DEFAULT_LOOP_SECONDS,
    timelineTimes,
    validateFrameEvidence,
    validateParityCase,
} from './lib/shader-parity-attestation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const effectId = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const shouldWrite = process.argv.includes('--write')

if (!effectId) {
    console.error('Usage: node scripts/attest-shader-parity.mjs <namespace/effect> [--write]')
    process.exit(2)
}

const effectDir = effectDirectory(repoRoot, effectId)
const casePath = path.join(effectDir, 'parity-case.json')
const attestationPath = path.join(effectDir, 'parity-attestation.json')

if (!fs.existsSync(casePath)) {
    throw new Error(`${effectId} has no parity-case.json`)
}

const initialCaseHash = computeFileHash(casePath)
const parityCase = JSON.parse(fs.readFileSync(casePath, 'utf8'))
assert.equal(computeFileHash(casePath), initialCaseHash, 'Parity case changed while loading')
const caseErrors = validateParityCase(parityCase, effectId)
if (caseErrors.length > 0) throw new Error(`Invalid parity case: ${caseErrors.join('; ')}`)
const resolution = parityCase.resolution
const initialSourceHash = computeParitySourceHash(repoRoot, parityCase)

// A tiled case renders the full image as a grid of tiles through the same
// setTileRegion() call the host's large-format export uses: each tile renders
// at tile size with its offset (bottom-origin, as the host passes it), the full
// resolution and the case's renderScale, and the tiles are stitched back into
// one full-resolution frame per backend.
const tilePlan = parityCase.tiles ? {
    fullResolution: resolution,
    renderScale: parityCase.tiles.renderScale ?? 1,
    tiles: Array.from({ length: (resolution[1] / parityCase.tiles.size[1]) * (resolution[0] / parityCase.tiles.size[0]) }, (_, index) => {
        const columns = resolution[0] / parityCase.tiles.size[0]
        return { offset: [(index % columns) * parityCase.tiles.size[0], Math.floor(index / columns) * parityCase.tiles.size[1]] }
    }),
} : null

// A timed case steps the engine through its frames on the fixed-step clock, in
// order. After each frame it uploads the texture inputs and sends the MIDI
// messages stated for that frame, and it captures at its last frame. An untimed
// case is one frame at time 0: it uploads after that render, as before.
const timelinePlan = parityCase.timeline ? {
    loopSeconds: parityCase.timeline.loopSeconds ?? TIMELINE_DEFAULT_LOOP_SECONDS,
    frames: parityCase.timeline.frames,
    times: timelineTimes(parityCase.timeline),
} : null

// A control render may leave the target out (a producer replaced by an empty
// input), so it returns the target pass count for the caller to judge. The
// case itself must execute the target.
async function renderBackend(browser, baseUrl, preferWebGPU, { dsl = parityCase.dsl, control = false } = {}) {
    const [width, height] = tilePlan ? parityCase.tiles.size : resolution
    const page = await browser.newPage({ viewport: { width, height } })
    const consoleMessages = []
    page.on('console', (message) => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(message.text())
    })
    page.on('pageerror', (error) => consoleMessages.push(error.message))

    try {
        if (preferWebGPU) {
            await page.goto(`${baseUrl}/shaders/effects/manifest.json`, { waitUntil: 'load' })
            consoleMessages.length = 0
        }
        await page.setContent(`<!doctype html>
<link rel="icon" href="data:,">
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
const renderer = new CanvasRenderer({
    canvas: document.getElementById('canvas'),
    width: ${width},
    height: ${height},
    basePath: '${baseUrl}/shaders',
    preferWebGPU: ${preferWebGPU}
});
const timeline = ${JSON.stringify(timelinePlan)};
const frames = timeline ? timeline.frames : [0];
const times = timeline ? timeline.times : [0];
const textureInputs = ${JSON.stringify(parityCase.textureInputs || [])};
const midiMessages = ${JSON.stringify(parityCase.midiMessages || [])};
await renderer.loadManifest();
await renderer.loadEffects(${JSON.stringify(parityCase.effects)});
if (timeline) renderer.setLoopDuration(timeline.loopSeconds);
// Note activity goes through the engine's own MIDI state, which the pipeline
// packs into its note grid texture before each frame.
const midi = midiMessages.length ? renderer.setMidiState() : null;
await renderer.compile(${JSON.stringify(dsl)});
renderer.stop();
const matchesTargetEffectPass = ${matchesTargetEffectPass.toString()};
function uploadTexture(texture) {
    const source = document.createElement('canvas');
    source.width = texture.width;
    source.height = texture.height;
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(texture.data), texture.width, texture.height), 0, 0);
    const passes = renderer.pipeline.graph.passes.filter((pass) => matchesTargetEffectPass(pass, texture.effect));
    if (!passes.length) throw new Error('Texture fixture has no executing effect: ' + texture.effect);
    // Only the target's passes that bind the fixture's uniform take it: a
    // pass of the same effect that binds other inputs, such as a history
    // shift, is left as it is.
    const bound = passes.filter((pass) => typeof pass.inputs?.[texture.uniform] === 'string');
    if (!bound.length) throw new Error('Texture fixture uniform is not bound: ' + texture.uniform);
    for (const pass of bound) {
        const textureId = pass.inputs[texture.uniform];
        const uploaded = renderer.updateTextureFromSource(textureId, source, { flipY: false });
        if (uploaded?.width !== texture.width || uploaded?.height !== texture.height) {
            throw new Error('Texture fixture upload dimensions differ');
        }
    }
}
function applyInputs(frame) {
    for (const texture of textureInputs) {
        if ((texture.afterFrame ?? frames[0]) === frame) uploadTexture(texture);
    }
    for (const message of midiMessages) {
        if (message.afterFrame === frame) midi.handleMessage(new Uint8Array(message.data));
    }
}
// Untimed note activity (midiInputs, the 1.x form) is fed before the first
// render: on the fixed-step clock only that render steps a stateful effect at
// time 0, so a note fed later would never reach its history. A timed case
// gives its notes as midiMessages instead.
// Each note goes in as a note-on message, as midiMessages do, so every
// reader of the MIDI state sees it, through one MIDI state for every input
// and at the fixed time 0, so a note's age reads the same on every run.
(${feedMidiInputs.toString()})(renderer, ${JSON.stringify((parityCase.midiInputs || []).map((midiInput) => midiNoteOnMessages([midiInput])))});
// A scene program renders asynchronously, so a timed case awaits each frame
// before its inputs. An untimed case renders as it did before.
if (timeline) await renderer.render(times[0]); else renderer.render(times[0]);
applyInputs(frames[0]);
for (const mesh of ${JSON.stringify(parityCase.meshInputs || [])}) {
    const loaded = await renderer.loadOBJFromURL('${baseUrl}/' + mesh.path, mesh.mesh);
    if (!loaded.success || !loaded.vertexCount) throw new Error('Mesh fixture did not load: ' + mesh.path + ' ' + (loaded.error || ''));
}
for (let index = 1; index < frames.length; index++) {
    await renderer.render(times[index]);
    applyInputs(frames[index]);
}
// A capture renders again at the case's last time. On the fixed-step clock a
// render at the same time runs no simulation step, so the captured state is
// the last frame's.
const captureTime = times.at(-1);
const settleMs = ${JSON.stringify(parityCase.settleMs || 0)};
const surface = renderer.pipeline.surfaces.get(${JSON.stringify(parityCase.surface || 'o0')});
const candidates = [surface?.read, surface?.write].filter(Boolean);
async function readBest() {
    if (timeline) {
        await renderer.render(captureTime);
        await renderer.render(captureTime);
    } else {
        renderer.render(captureTime);
        renderer.render(captureTime);
    }
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone?.();
    let capture = null;
    for (const id of candidates) {
        try {
            const pixels = await renderer.pipeline.backend.readPixels(id);
            if (!pixels?.data) continue;
            let nonzeroRgbPixels = 0;
            let nonzeroAlphaPixels = 0;
            const colors = new Set();
            for (let i = 0; i < pixels.data.length; i += 4) {
                if (pixels.data[i] || pixels.data[i + 1] || pixels.data[i + 2]) nonzeroRgbPixels++;
                if (pixels.data[i + 3]) nonzeroAlphaPixels++;
                colors.add(pixels.data[i] + ',' + pixels.data[i + 1] + ',' + pixels.data[i + 2]);
            }
            if (!capture || nonzeroRgbPixels > capture.nonzeroRgbPixels) {
                capture = {
                    id,
                    width: pixels.width,
                    height: pixels.height,
                    nonzeroRgbPixels,
                    nonzeroAlphaPixels,
                    uniqueColors: colors.size,
                    data: Array.from(pixels.data)
                };
            }
        } catch {}
    }
    return capture;
}
function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}
async function captureSettled() {
    let capture = await readBest();
    const settleDeadline = Date.now() + settleMs;
    let settled = settleMs === 0;
    while (Date.now() < settleDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const next = await readBest();
        if (next && capture && sameBytes(next.data, capture.data)) {
            capture = next;
            settled = true;
            break;
        }
        if (next) capture = next;
    }
    return { capture, settled };
}
const tilePlan = ${JSON.stringify(tilePlan)};
let capture = null;
let settled = true;
if (!tilePlan) {
    ({ capture, settled } = await captureSettled());
} else {
    // WebGL2 readback rows run top-first and WebGPU readback rows bottom-first;
    // each stitched frame keeps its backend's row order, as an untiled capture does.
    const [fullWidth, fullHeight] = tilePlan.fullResolution;
    const topFirst = renderer.pipeline.backend.getName() === 'WebGL2';
    const data = new Array(fullWidth * fullHeight * 4).fill(0);
    let id = null;
    for (const tile of tilePlan.tiles) {
        renderer.setTileRegion({ offset: tile.offset, fullResolution: tilePlan.fullResolution, renderScale: tilePlan.renderScale });
        const part = await captureSettled();
        if (!part.capture) { id = null; break; }
        settled = settled && part.settled;
        id = part.capture.id;
        const tileWidth = part.capture.width;
        const tileHeight = part.capture.height;
        for (let row = 0; row < tileHeight; row++) {
            const fullRow = topFirst ? fullHeight - tile.offset[1] - tileHeight + row : tile.offset[1] + row;
            const from = row * tileWidth * 4;
            const to = (fullRow * fullWidth + tile.offset[0]) * 4;
            for (let i = 0; i < tileWidth * 4; i++) data[to + i] = part.capture.data[from + i];
        }
    }
    renderer.clearTileRegion();
    if (id) {
        let nonzeroRgbPixels = 0;
        let nonzeroAlphaPixels = 0;
        const colors = new Set();
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] || data[i + 1] || data[i + 2]) nonzeroRgbPixels++;
            if (data[i + 3]) nonzeroAlphaPixels++;
            colors.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
        }
        capture = { id, width: fullWidth, height: fullHeight, nonzeroRgbPixels, nonzeroAlphaPixels, uniqueColors: colors.size, data };
    }
}
window.parityResult = {
    backend: renderer.pipeline.backend.getName(),
    targetPassCount: renderer.pipeline.graph.passes.filter((pass) =>
        matchesTargetEffectPass(pass, ${JSON.stringify(effectId)})
    ).length,
    settled,
    capture
};
</script>`, { waitUntil: 'load' })
        await page.waitForFunction(() => window.parityResult, null, { timeout: 30000 * (tilePlan ? tilePlan.tiles.length : 1) })
        const result = await page.evaluate(() => window.parityResult)
        const expectedBackend = preferWebGPU ? 'WebGPU' : 'WebGL2'
        assert.equal(result.backend, expectedBackend, `expected ${expectedBackend}, got ${result.backend}`)
        if (!control) assert.ok(result.targetPassCount > 0, `${expectedBackend} graph did not execute ${effectId}`)
        assert.ok(result.capture, `${expectedBackend} produced no readable output`)
        if ((parityCase.settleMs || 0) > 0) {
            assert.ok(result.settled, `${expectedBackend} capture did not settle within ${parityCase.settleMs} ms`)
        }
        assert.deepEqual(consoleMessages, [], `${expectedBackend} console errors:\n${consoleMessages.join('\n')}`)
        return result
    } finally {
        await page.close()
    }
}

const effectsDir = path.join(repoRoot, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot
const { acquireServer, releaseServer } = await import('../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
let browser

try {
    browser = await chromium.launch(shaderTestBrowserOptions())
    const webglResult = await renderBackend(browser, baseUrl, false)
    const webgpuResult = await renderBackend(browser, baseUrl, true)
    const webgl = webglResult.capture
    const webgpu = webgpuResult.capture
    const frames = {
        webgl2: {
            width: webgl.width,
            height: webgl.height,
            nonzeroRgbPixels: webgl.nonzeroRgbPixels,
            nonzeroAlphaPixels: webgl.nonzeroAlphaPixels,
            uniqueColors: webgl.uniqueColors,
        },
        webgpu: {
            width: webgpu.width,
            height: webgpu.height,
            nonzeroRgbPixels: webgpu.nonzeroRgbPixels,
            nonzeroAlphaPixels: webgpu.nonzeroAlphaPixels,
            uniqueColors: webgpu.uniqueColors,
        },
    }
    const execution = {
        webgl2TargetPasses: webglResult.targetPassCount,
        webgpuTargetPasses: webgpuResult.targetPassCount,
    }

    const frameErrors = validateFrameEvidence(frames, parityCase.requireColorVariation === true)
    if (frameErrors.length > 0) {
        throw new Error(`EMPTY FRAME GATE FAILED: ${frameErrors.join('; ')}`)
    }

    const parity = comparePixelFrames(webgl, webgpu)
    if (parity.mismatchCount !== 0 || parity.maxDiff !== 0) {
        const samples = []
        for (let y = 0; y < webgl.height && samples.length < 8; y++) {
            for (let x = 0; x < webgl.width && samples.length < 8; x++) {
                const gl = webgl.data.slice((y * webgl.width + x) * 4, (y * webgl.width + x + 1) * 4)
                const gpuIndex = ((webgpu.height - 1 - y) * webgpu.width + x) * 4
                const gpu = webgpu.data.slice(gpuIndex, gpuIndex + 4)
                if (gl.some((value, channel) => value !== gpu[channel])) samples.push({ x, y, webgl2: gl, webgpu: gpu })
            }
        }
        throw new Error(`PIXEL PARITY FAILED: ${JSON.stringify({ ...parity, samples })}`)
    }

    // A case with a control must show that its target matters: the control,
    // the case with the target's contribution disabled (its time-dependence, or
    // a producer's output), must render a different frame on each backend, with
    // the same timeline and inputs. Identical frames fail, as an empty frame does.
    let control = null
    if (parityCase.control !== undefined) {
        const differs = {}
        const targetPasses = {}
        for (const [backend, preferWebGPU, capture] of [['webgl2', false, webgl], ['webgpu', true, webgpu]]) {
            const result = await renderBackend(browser, baseUrl, preferWebGPU, { dsl: parityCase.control, control: true })
            const frame = result.capture
            differs[backend] = !(frame.width === capture.width && frame.height === capture.height &&
                frame.data.length === capture.data.length && frame.data.every((value, index) => value === capture.data[index]))
            targetPasses[backend] = result.targetPassCount
        }
        // A timed control disables the target's time-dependence, so it must
        // still run the target; only a producer's control may replace it.
        if (timelinePlan && (targetPasses.webgl2 < 1 || targetPasses.webgpu < 1)) {
            throw new Error(`CONTROL GATE FAILED: a timed case control must run ${effectId} (target passes ${JSON.stringify(targetPasses)})`)
        }
        if (!differs.webgl2 || !differs.webgpu) {
            throw new Error(`CONTROL GATE FAILED: the control renders the same frame as the case (${JSON.stringify(differs)}); the case does not show that ${effectId} contributes to the frame`)
        }
        control = { differs, targetPasses }
    }

    assert.equal(computeParitySourceHash(repoRoot, parityCase), initialSourceHash, 'Shader sources changed during attestation')
    assert.equal(computeFileHash(casePath), initialCaseHash, 'Parity case changed during attestation')

    const attestation = {
        schemaVersion: PARITY_ATTESTATION_SCHEMA_VERSION,
        effect: effectId,
        sourceHash: initialSourceHash,
        caseHash: initialCaseHash,
        resolution,
        frames,
        execution,
        parity,
        ...(timelinePlan ? { timeline: { frames: timelinePlan.frames, loopSeconds: timelinePlan.loopSeconds } } : {}),
        ...(control ? { control } : {}),
    }

    if (shouldWrite) {
        fs.writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`)
        console.log(`Wrote ${path.relative(repoRoot, attestationPath)}`)
    } else {
        process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`)
    }
} finally {
    if (browser) await browser.close()
    releaseServer()
}
