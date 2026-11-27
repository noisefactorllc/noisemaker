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
 * timed case needs none here. Fields of the pin tool's own: audio,
 * "ramps", fills the waveform and the spectrum with the cross-backend
 * agreement harness's ramps, for an effect that draws audio input; and
 * portablePackages, [{ id, path }], names Portable package directories in the
 * repository, which the page loads with loadPortablePackage() and registers
 * through registerPortableEffect() before it compiles. An effect a package
 * registers is not loaded from the catalog.
 *
 * --allow-blank accepts a frame with no lit pixel, as a render of a case with
 * its target or its inputs taken away may have, instead of failing it.
 *
 * A baseline file holds one entry for each GPU it was recorded on (see
 * pin-baselines.mjs). --out records this machine's entry and keeps the others;
 * --check compares against this machine's entry and fails when there is none.
 *
 * --bundles <dir|url> renders from built bundles instead of the source: the
 * core and the effect bundles of a dist/ directory that
 * `npm run bundle:shaders` builds (dist/shaders/ and dist/effects/), or of a
 * published version at its base URL. --backend webgl2|webgpu renders one
 * backend and checks it alone. Both only check: a pin is recorded from the
 * source, on both backends.
 *
 *   node shaders/scripts/pin-effect-pixels.mjs --case <cases.json> --entries <id,...> --pins <dir> [--bundles <dir|url>] [--backend webgl2|webgpu]
 *
 * checks each entry against <dir>/<id>.pin.json in one browser, each on a page
 * of its own, prints "ok <id>" or "FAILED <id>: <reason>" for each, and fails
 * when any does.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { feedMidiInputs, matchesTargetEffectPass, midiNoteOnMessages, timelineTimes, TIMELINE_DEFAULT_LOOP_SECONDS } from '../../scripts/lib/shader-parity-attestation.mjs'
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
const bundles = flagValue('--bundles')
const backendFlag = flagValue('--backend')
const entries = flagValue('--entries')?.split(',').filter(Boolean) ?? null
const pinsDir = flagValue('--pins')

const single = entries === null && pinsDir === null && Boolean(outPath || checkPath)
const batch = entries !== null && pinsDir !== null && !outPath && !checkPath && entry === null
if (!casePath || !(single || batch) || (backendFlag !== null && !['webgl2', 'webgpu'].includes(backendFlag)) ||
    (outPath && (bundles !== null || backendFlag !== null))) {
    console.error([
        'Usage: node shaders/scripts/pin-effect-pixels.mjs --case <case.json> [--entry <id>] (--out <pin.json> | --check <pin.json> [--bundles <dir|url>] [--backend webgl2|webgpu])',
        '       node shaders/scripts/pin-effect-pixels.mjs --case <cases.json> --entries <id,...> --pins <dir> [--bundles <dir|url>] [--backend webgl2|webgpu]',
    ].join('\n'))
    process.exit(2)
}
const BACKENDS = backendFlag ? [backendFlag] : ['webgl2', 'webgpu']

const CONTENT_TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.obj': 'text/plain', '.wasm': 'application/wasm' }

const BUNDLE_MOUNT = '/__bundles/'

// Serve the checkout, and a bundle directory under /__bundles/, from one
// origin: the page imports the bundles from the origin it renders on, as a
// browser refuses an import from another loopback port.
function serveCheckoutAndBundles(checkout, bundleRoot) {
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname)
        const [root, relative] = pathname.startsWith(BUNDLE_MOUNT) ? [bundleRoot, pathname.slice(BUNDLE_MOUNT.length)] : [checkout, pathname.slice(1)]
        const file = path.resolve(root, relative)
        // A page set with setContent() has no origin of its own, so its
        // imports are cross-origin.
        const cors = { 'Access-Control-Allow-Origin': '*' }
        if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404, { ...cors, 'Content-Type': 'text/plain' })
            response.end('not found')
            return
        }
        response.writeHead(200, { ...cors, 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' })
        fs.createReadStream(file).pipe(response)
    })
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })))
}

/**
 * Where the page loads the engine and the effects from: the source, or the
 * core, manifest and effect bundles of a dist/ directory or published version.
 */
function bundleSources(base) {
    const dist = !/^https?:/.test(bundles) && fs.existsSync(path.join(bundles, 'shaders', 'noisemaker-shaders-core.esm.js'))
    const engineBase = dist ? `${base}/shaders` : base
    return { core: `${engineBase}/noisemaker-shaders-core.esm.js`, basePath: engineBase, bundlePath: `${base}/effects` }
}

const caseFile = JSON.parse(fs.readFileSync(casePath, 'utf8'))

// A package directory as [path, text] entries, for the page to load.
function packageEntries(directory, prefix = '', entries = []) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const name = prefix ? `${prefix}/${item.name}` : item.name
        if (item.isDirectory()) packageEntries(path.join(directory, item.name), name, entries)
        else entries.push([name, fs.readFileSync(path.join(directory, item.name), 'utf8')])
    }
    return entries
}
/** A case of the file, checked, with what the page renders it from. */
function prepareCase(file, name) {
    const pinCase = name === null ? file : file?.cases?.[name]
    if (!pinCase) throw new Error(`${casePath} has no case ${name}`)
    // The file the case comes from defines its other fields.
    const caseErrors = pinCaseErrors(pinCase, name ?? pinCase.effects?.at(-1))
    if (caseErrors.length) throw new Error(`pin case is not valid: ${caseErrors.join('; ')}`)
    const timelinePlan = pinCase.timeline ? {
        loopSeconds: pinCase.timeline.loopSeconds ?? TIMELINE_DEFAULT_LOOP_SECONDS,
        frames: pinCase.timeline.frames,
        times: timelineTimes(pinCase.timeline),
    } : null
    const [width, height] = pinCase.resolution
    const portablePackages = (pinCase.portablePackages || []).map(({ id, path: directory }) => {
        if (typeof id !== 'string' || typeof directory !== 'string') throw new Error('pin case portablePackages entries are { id, path }')
        return { id, entries: packageEntries(path.join(repoRoot, directory)) }
    })
    return { name, pinCase, timelinePlan, width, height, portablePackages }
}

async function renderBackend(browser, baseUrl, preferWebGPU, sources, prepared) {
    const { pinCase, timelinePlan, width, height, portablePackages } = prepared
    const engine = sources ?? { core: `${baseUrl}/shaders/src/index.js`, basePath: `${baseUrl}/shaders`, bundlePath: null }
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
import * as engine from '${engine.core}';
const { CanvasRenderer, loadPortablePackage } = engine;
const renderer = new CanvasRenderer({
    canvas: document.getElementById('canvas'),
    width: ${width},
    height: ${height},
    basePath: '${engine.basePath}',
    ...(${JSON.stringify(engine.bundlePath)} ? { useBundles: true, bundlePath: ${JSON.stringify(engine.bundlePath)} } : {}),
    preferWebGPU: ${preferWebGPU}
});
const timeline = ${JSON.stringify(timelinePlan)};
const frames = timeline ? timeline.frames : [0];
const times = timeline ? timeline.times : [0];
const textureInputs = ${JSON.stringify(pinCase.textureInputs || [])};
const midiMessages = ${JSON.stringify(pinCase.midiMessages || [])};
await renderer.loadManifest();
const portablePackages = ${JSON.stringify(portablePackages)};
const encoder = new TextEncoder();
for (const portable of portablePackages) {
    const loaded = loadPortablePackage(new Map(portable.entries.map(([name, text]) => [name, encoder.encode(text)])));
    if (loaded.diagnostics.length) throw new Error('Portable package ' + portable.id + ' is refused: ' + JSON.stringify(loaded.diagnostics));
    await renderer.registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders });
}
const packaged = new Set(portablePackages.map((portable) => portable.id));
await renderer.loadEffects(${JSON.stringify(pinCase.effects)}.filter((id) => !packaged.has(id)));
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
// Untimed note activity is fed before the first render, as the recorder
// feeds it.
// Each note goes in as a note-on message, as midiMessages do, so every
// reader of the MIDI state sees it, as the recorder feeds it: one MIDI state
// for every input, at the fixed time 0.
(${feedMidiInputs.toString()})(renderer, ${JSON.stringify((pinCase.midiInputs || []).map((midiInput) => midiNoteOnMessages([midiInput])))});
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
        try {
            await page.waitForFunction(() => window.pinResult, null, { timeout: 60000 })
        } catch (error) {
            // The page's own errors say why it did not render.
            throw new Error(`${preferWebGPU ? 'WebGPU' : 'WebGL2'} did not render: ${error.message}${consoleMessages.length ? `\n  ${consoleMessages.join('\n  ')}` : ''}`, { cause: error })
        }
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
// A bundle directory is served with the checkout from one origin.
const bundleServer = bundles !== null && !/^https?:/.test(bundles) ? await serveCheckoutAndBundles(repoRoot, path.resolve(bundles)) : null
const baseUrl = bundleServer ? bundleServer.url : await acquireServer(undefined, repoRoot, effectsDir)
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
    let sources = null
    if (bundles !== null) {
        sources = bundleSources(bundleServer ? `${bundleServer.url}${BUNDLE_MOUNT.slice(0, -1)}` : bundles.replace(/\/+$/, ''))
        console.log(`Rendering from the bundles at ${bundles}`)
    }
    // The pin of a case: its frame on each backend this run renders.
    const renderPin = async prepared => {
        const captures = {}
        for (const backend of BACKENDS) captures[backend] = await renderBackend(browser, baseUrl, backend === 'webgpu', sources, prepared)
        const gpus = [...new Set(Object.values(captures).map(capture => capture.gpu))]
        assert.equal(gpus.length, 1, 'the two backends report different GPUs')
        return {
            case: path.relative(repoRoot, path.resolve(casePath)).split(path.sep).join('/') + (prepared.name === null ? '' : `#${prepared.name}`),
            resolution: [prepared.width, prepared.height],
            gpu: gpus[0],
            ...Object.fromEntries(Object.entries(captures).map(([backend, capture]) => [backend, pinFrame(capture)])),
        }
    }
    // The differences of a pin from the baseline of its file for its GPU.
    const pinChanges = (pin, file) => {
        const expected = baselineForGpu(JSON.parse(fs.readFileSync(file, 'utf8')), pin.gpu)
        const failures = []
        for (const backend of BACKENDS) {
            const before = expected[backend]
            const after = pin[backend]
            const status = before?.sha256 === after.sha256 ? 'IDENTICAL' : 'CHANGED'
            console.log(`  ${backend.padEnd(6)} ${status}  before=${before?.sha256} after=${after.sha256}`)
            if (status === 'CHANGED') failures.push(`${backend}: ${before?.sha256} -> ${after.sha256}`)
        }
        return failures
    }

    if (batch) {
        // Every case in this one browser, each on a page of its own.
        const failed = []
        for (const name of entries) {
            try {
                const file = path.join(pinsDir, `${name}.pin.json`)
                if (!fs.existsSync(file)) throw new Error(`it has no pin (${path.relative(repoRoot, file)})`)
                const failures = pinChanges(await renderPin(prepareCase(caseFile, name)), file)
                if (failures.length) throw new Error(`PIXEL PIN FAILED: ${failures.join('; ')}`)
                console.log(`ok ${name}`)
            } catch (error) {
                failed.push(name)
                console.log(`FAILED ${name}: ${error.message.split('\n').join(' | ')}`)
            }
        }
        console.log(`${entries.length - failed.length} of ${entries.length} pins hold on ${BACKENDS.join(' and ')}`)
        if (failed.length) process.exitCode = 1
    } else {
        const pin = await renderPin(prepareCase(caseFile, entry))
        if (outPath) {
            const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null
            fs.writeFileSync(outPath, `${JSON.stringify(withGpuBaseline(existing, pin), null, 2)}\n`)
            console.log(`Wrote ${outPath} for ${pin.gpu}`)
            console.log(`  webgl2 ${pin.webgl2.sha256}  (${pin.webgl2.nonzeroRgbPixels} lit px, ${pin.webgl2.uniqueColors} colors)`)
            console.log(`  webgpu ${pin.webgpu.sha256}  (${pin.webgpu.nonzeroRgbPixels} lit px, ${pin.webgpu.uniqueColors} colors)`)
        } else {
            const failures = pinChanges(pin, checkPath)
            if (failures.length > 0) {
                throw new Error(`PIXEL PIN FAILED:\n  ${failures.join('\n  ')}`)
            }
            console.log(BACKENDS.length === 2 ? 'Pixel pin holds on both backends.' : `Pixel pin holds on ${BACKENDS[0]}.`)
        }
    }
} finally {
    if (browser) await browser.close()
    if (bundleServer) await new Promise(resolve => bundleServer.server.close(resolve))
    else releaseServer()
}
