#!/usr/bin/env node
/**
 * Per-backend before/after pixel pin.
 *
 * The parity attestation (scripts/attest-shader-parity.mjs) asks "do the two
 * backends agree?". This asks a different question: "does each backend still
 * produce what it produced before?". It never compares WebGL2 against WebGPU:
 * the two readbacks arrive in opposite row order, so their raw bytes never
 * hash alike even when the rendered images are identical pixel for pixel.
 * Aligning the two rasters is the attestation's job — see comparePixelFrames
 * in scripts/lib/shader-parity-attestation.mjs, and the epsilon-0
 * parity-attestation.json committed beside each volumetric marcher. Here each
 * backend is only ever compared against its own prior self, which is what
 * makes this the right gate for a refactor that must not move a single pixel.
 *
 *   node shaders/scripts/pin-effect-pixels.mjs --case <case.json> --out <pin.json>
 *   node shaders/scripts/pin-effect-pixels.mjs --case <case.json> --check <pin.json>
 *   node shaders/scripts/pin-effect-pixels.mjs --case <cases.json> --entry <id> (--out | --check) <pin.json>
 *
 * With --entry, the case is the entry <id> of the file's `cases` object, as
 * the Portable migration's render cases are stored, and the pin names it
 * <file>#<id>.
 *
 * The case file reuses the parity-case.json shape so one file can serve both
 * tools. Its effects, dsl, surface, resolution, settleMs, textureInputs,
 * meshInputs, timeline and midiMessages mean what they mean in a parity case
 * (see scripts/attest-shader-parity.mjs): the pin tool checks them with the
 * attestation's own validateParityCase, and renders them as the recorder
 * renders them, so a pin renders what that case's attestation renders. A timed
 * case renders its frames in order on the fixed-step clock, applies each
 * frame's inputs after it, and is read at its last frame. A case's tiles are
 * not honoured: a pin compares the untiled frame. A pin reads no control, so a
 * timed case needs none here. One field is the pin tool's own: audio,
 * "ramps", fills the waveform and the spectrum with the cross-backend
 * agreement harness's ramps, for an effect that draws audio input.
 *
 * --allow-blank accepts a frame with no lit pixel, as a render of a case with
 * its target or its inputs taken away may have, instead of failing it.
 *
 * A baseline file holds one entry for each GPU it was recorded on (see
 * pin-baselines.mjs). --out records this machine's entry and keeps the others;
 * --check compares against this machine's entry and fails when there is none.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { matchesTargetEffectPass, timelineTimes, TIMELINE_DEFAULT_LOOP_SECONDS } from '../../scripts/lib/shader-parity-attestation.mjs'
import { baselineForGpu, pinCaseErrors, withGpuBaseline } from './pin-baselines.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

function flagValue(name) {
    const index = process.argv.indexOf(name)
    return index === -1 ? null : process.argv[index + 1]
}

const casePath = flagValue('--case')
const entry = flagValue('--entry')
const outPath = flagValue('--out')
const checkPath = flagValue('--check')
const allowBlank = process.argv.includes('--allow-blank')

if (!casePath || (!outPath && !checkPath)) {
    console.error('Usage: node shaders/scripts/pin-effect-pixels.mjs --case <case.json> [--entry <id>] (--out <pin.json> | --check <pin.json>)')
    process.exit(2)
}

const caseFile = JSON.parse(fs.readFileSync(casePath, 'utf8'))
const pinCase = entry === null ? caseFile : caseFile?.cases?.[entry]
if (!pinCase) throw new Error(`${casePath} has no case ${entry}`)
// The file the case comes from defines its other fields.
const caseErrors = pinCaseErrors(pinCase, entry ?? pinCase.effects?.at(-1))
if (caseErrors.length) throw new Error(`pin case is not valid: ${caseErrors.join('; ')}`)
const timelinePlan = pinCase.timeline ? {
    loopSeconds: pinCase.timeline.loopSeconds ?? TIMELINE_DEFAULT_LOOP_SECONDS,
    frames: pinCase.timeline.frames,
    times: timelineTimes(pinCase.timeline),
} : null
const [width, height] = pinCase.resolution

async function renderBackend(browser, baseUrl, preferWebGPU) {
    const page = await browser.newPage({ viewport: { width, height } })
    const consoleMessages = []
    page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(message.text())
    })
    page.on('pageerror', (error) => consoleMessages.push(error.message))

    try {
        if (preferWebGPU) {
            await page.goto(`${baseUrl}/shaders/manifest.json`, { waitUntil: 'load' })
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
const textureInputs = ${JSON.stringify(pinCase.textureInputs || [])};
const midiMessages = ${JSON.stringify(pinCase.midiMessages || [])};
await renderer.loadManifest();
await renderer.loadEffects(${JSON.stringify(pinCase.effects)});
if (timeline) renderer.setLoopDuration(timeline.loopSeconds);
if (${JSON.stringify(pinCase.audio || null)} === 'ramps') {
    const audio = renderer.setAudioState();
    audio.waveform.set(Float32Array.from({ length: 128 }, (_, i) => i / 127));
    audio.spectrum.set(Float32Array.from({ length: 128 }, (_, i) => (127 - i) / 127));
}
// Note activity goes through the engine's own MIDI state, as the recorder sends it.
const midi = midiMessages.length ? renderer.setMidiState() : null;
await renderer.compile(${JSON.stringify(pinCase.dsl)});
renderer.stop();
const matchesTargetEffectPass = ${matchesTargetEffectPass.toString()};
function uploadTexture(texture) {
    const source = document.createElement('canvas');
    source.width = texture.width;
    source.height = texture.height;
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(texture.data), texture.width, texture.height), 0, 0);
    const passes = renderer.pipeline.graph.passes.filter((pass) => matchesTargetEffectPass(pass, texture.effect));
    if (!passes.length) throw new Error('Texture fixture has no executing effect: ' + texture.effect);
    // As the recorder does: only the effect's passes that bind the uniform take the fixture.
    const bound = passes.filter((pass) => typeof pass.inputs?.[texture.uniform] === 'string');
    if (!bound.length) throw new Error('Texture fixture uniform is not bound: ' + texture.uniform);
    for (const pass of bound) {
        const uploaded = renderer.updateTextureFromSource(pass.inputs[texture.uniform], source, { flipY: false });
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
// A scene program renders asynchronously, so every render is awaited.
await renderer.render(times[0]);
applyInputs(frames[0]);
for (const mesh of ${JSON.stringify(pinCase.meshInputs || [])}) {
    const loaded = await renderer.loadOBJFromURL('${baseUrl}/' + mesh.path, mesh.mesh);
    if (!loaded.success || !loaded.vertexCount) throw new Error('Mesh fixture did not load: ' + mesh.path + ' ' + (loaded.error || ''));
}
for (let index = 1; index < frames.length; index++) {
    await renderer.render(times[index]);
    applyInputs(frames[index]);
}
// The capture renders again at the last time, which on the fixed-step clock
// runs no simulation step.
const captureTime = times.at(-1);
const settleMs = ${JSON.stringify(pinCase.settleMs || 0)};
const surface = renderer.pipeline.surfaces.get(${JSON.stringify(pinCase.surface)});
const candidates = [surface?.read, surface?.write].filter(Boolean);
async function readBest() {
    await renderer.render(captureTime);
    await renderer.render(captureTime);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone?.();
    let capture = null;
    for (const id of candidates) {
        try {
            const pixels = await renderer.pipeline.backend.readPixels(id);
            if (!pixels?.data) continue;
            let nonzeroRgbPixels = 0;
            const colors = new Set();
            for (let i = 0; i < pixels.data.length; i += 4) {
                if (pixels.data[i] || pixels.data[i + 1] || pixels.data[i + 2]) nonzeroRgbPixels++;
                colors.add(pixels.data[i] + ',' + pixels.data[i + 1] + ',' + pixels.data[i + 2]);
            }
            if (!capture || nonzeroRgbPixels > capture.nonzeroRgbPixels) {
                capture = {
                    id,
                    width: pixels.width,
                    height: pixels.height,
                    nonzeroRgbPixels,
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
// A case with settleMs is captured once two consecutive readings agree.
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
const probe = document.createElement('canvas').getContext('webgl2');
const info = probe?.getExtension('WEBGL_debug_renderer_info');
const gpu = info ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
window.pinResult = { backend: renderer.pipeline.backend.getName(), settled, gpu, capture };
</script>`, { waitUntil: 'load' })
        await page.waitForFunction(() => window.pinResult, null, { timeout: 60000 })
        const result = await page.evaluate(() => window.pinResult)
        const expectedBackend = preferWebGPU ? 'WebGPU' : 'WebGL2'
        assert.equal(result.backend, expectedBackend, `expected ${expectedBackend}, got ${result.backend}`)
        assert.ok(result.capture, `${expectedBackend} produced no readable output`)
        if (!allowBlank) assert.ok(result.capture.nonzeroRgbPixels > 0, `${expectedBackend} frame is empty`)
        if ((pinCase.settleMs || 0) > 0) {
            assert.ok(result.settled, `${expectedBackend} capture did not settle within ${pinCase.settleMs} ms`)
        }
        if (consoleMessages.length > 0) {
            console.error(`${expectedBackend} console output:\n  ${consoleMessages.join('\n  ')}`)
        }
        return { ...result.capture, gpu: result.gpu }
    } finally {
        await page.close()
    }
}

function pinFrame(capture) {
    let alphaMin = 255
    let alphaMax = 0
    for (let i = 3; i < capture.data.length; i += 4) {
        if (capture.data[i] < alphaMin) alphaMin = capture.data[i]
        if (capture.data[i] > alphaMax) alphaMax = capture.data[i]
    }
    return {
        surface: capture.id,
        width: capture.width,
        height: capture.height,
        nonzeroRgbPixels: capture.nonzeroRgbPixels,
        uniqueColors: capture.uniqueColors,
        alpha: [alphaMin, alphaMax],
        sha256: crypto.createHash('sha256').update(Buffer.from(capture.data)).digest('hex'),
    }
}

const effectsDir = path.join(repoRoot, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
let browser

try {
    browser = await chromium.launch({
        headless: true,
        args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan',
        ],
    })
    const webgl2 = await renderBackend(browser, baseUrl, false)
    const webgpu = await renderBackend(browser, baseUrl, true)
    assert.equal(webgpu.gpu, webgl2.gpu, 'the two backends report different GPUs')
    const pin = {
        case: path.relative(repoRoot, path.resolve(casePath)).split(path.sep).join('/') + (entry === null ? '' : `#${entry}`),
        resolution: [width, height],
        gpu: webgl2.gpu,
        webgl2: pinFrame(webgl2),
        webgpu: pinFrame(webgpu),
    }

    if (outPath) {
        const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null
        fs.writeFileSync(outPath, `${JSON.stringify(withGpuBaseline(existing, pin), null, 2)}\n`)
        console.log(`Wrote ${outPath} for ${pin.gpu}`)
        console.log(`  webgl2 ${pin.webgl2.sha256}  (${pin.webgl2.nonzeroRgbPixels} lit px, ${pin.webgl2.uniqueColors} colors)`)
        console.log(`  webgpu ${pin.webgpu.sha256}  (${pin.webgpu.nonzeroRgbPixels} lit px, ${pin.webgpu.uniqueColors} colors)`)
    } else {
        const expected = baselineForGpu(JSON.parse(fs.readFileSync(checkPath, 'utf8')), pin.gpu)
        const failures = []
        for (const backend of ['webgl2', 'webgpu']) {
            const before = expected[backend]
            const after = pin[backend]
            const status = before?.sha256 === after.sha256 ? 'IDENTICAL' : 'CHANGED'
            console.log(`  ${backend.padEnd(6)} ${status}  before=${before?.sha256} after=${after.sha256}`)
            if (status === 'CHANGED') {
                failures.push(`${backend}: ${before?.sha256} -> ${after.sha256}`)
            }
        }
        if (failures.length > 0) {
            throw new Error(`PIXEL PIN FAILED:\n  ${failures.join('\n  ')}`)
        }
        console.log('Pixel pin holds on both backends.')
    }
} finally {
    if (browser) await browser.close()
    releaseServer()
}
