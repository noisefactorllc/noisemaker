#!/usr/bin/env node
/**
 * The wide-gamut regression corpus: the programs and cases that must keep their
 * appearance while wide-gamut output is built, and their baselines on the
 * recording GPU.
 *
 *   node shaders/scripts/wide-gamut-corpus.mjs cases --programs <dir>
 *       Writes a case file, in the parity-case.json shape, for each program of
 *       Noisedeck's curated, classic and basics lists, read from <dir>
 *       (curated.json, classic.json, basics.json).
 *   node shaders/scripts/wide-gamut-corpus.mjs pins [--only <id>]
 *       Records the surface pin of every pin case with pin-effect-pixels.mjs --out.
 *   node shaders/scripts/wide-gamut-corpus.mjs canvas [--only <id>]
 *       Records the srgb canvas bytes, after present, of every canvas case.
 *   node shaders/scripts/wide-gamut-corpus.mjs frames [--only <id>] [--root <dir>]
 *       Records the frames that frame export delivers with an srgb descriptor,
 *       in each alpha mode, of every canvas case, to frame-bytes.json. --root
 *       serves the renderer and the effects from another tree and records its
 *       frames; the cases are read from this checkout. The tree holds
 *       shaders/, demo/shaders/ and share/ at one commit, for example W's:
 *       git archive <W> shaders demo/shaders share | tar -x -C <dir>
 *   node shaders/scripts/wide-gamut-corpus.mjs banding [--backend webgpu|webgl2] [--only <id>] [--frames <file>]
 *       Models the quantization of an 8-bit and a 16-bit float Display P3
 *       canvas, or drawing buffer, on the srgb frames of the canvas cases on
 *       one backend (WebGPU by default), and prints the summary. It renders
 *       no P3 canvas. --frames also writes the result of each frame to <file>.
 *   node shaders/scripts/wide-gamut-corpus.mjs p3check [--backend webgpu|webgl2] [--headed] [--only <id>] [--frames <file>]
 *       Renders each canvas case under srgb and under display-p3 on one
 *       backend, converts the display-p3 canvas copy back to sRGB, compares it
 *       with the srgb canvas (compareP3Frame), and prints the summary. Without
 *       --headed, the browser is headless and the page reports a P3 display to
 *       the renderer. --frames also writes the result of each frame to <file>.
 *       The display-p3 pass then renders the reference programs
 *       (P3_REFERENCE_CASES), whose colors are known in Display P3, and checks
 *       their canvas copy and their read-back in Display P3 (checkReference).
 *       --only also selects the reference programs by id.
 *       --check fails when the summary exceeds ROUND_TRIP_BOUNDS, or when a
 *       reference program fails its check.
 *   node shaders/scripts/wide-gamut-corpus.mjs p3photo
 *       Writes the Display P3 PNG fixture, display-p3-photo.png: P3 red, P3
 *       green, P3 blue, P3 middle gray and an orange inside sRGB whose P3 and
 *       sRGB values differ, one pixel each. Headless Chromium
 *       draws it on a Display P3 canvas, and the PNG carries that canvas's
 *       Display P3 profile.
 *   node shaders/scripts/wide-gamut-corpus.mjs matrix
 *       Records what each wide-gamut support check reports in headless Chromium.
 *   node shaders/scripts/wide-gamut-corpus.mjs list --programs <dir> --w <sha> --gpu <renderer>
 *         [--excluded <file>] [--scene-pins <file>]
 *       Writes the corpus list from the cases and baselines on disk. --excluded maps
 *       a case the pin tool cannot render to its reason; --scene-pins maps each
 *       scene pin to its case and its --check result.
 *
 * Everything it writes is under shaders/tests/fixtures/wide-gamut/, except the
 * --frames file of banding and p3check.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { extractEffectNamesFromDsl } from '../../demo/shaders/lib/demo-ui.js'
import { DISPLAY_P3_TO_SRGB, SRGB_TO_DISPLAY_P3, decodeSrgb, displayP3ToSrgb, encodeSrgb, presentDisplayP3 } from '../src/runtime/display-p3-conversion.js'
import { matchesTargetEffectPass } from '../../scripts/lib/shader-parity-attestation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(__dirname, '..', '..')
export const corpusDir = path.join(repoRoot, 'shaders/tests/fixtures/wide-gamut')
export const casesDir = path.join(corpusDir, 'cases')
export const pinsDir = path.join(corpusDir, 'pins')
export const canvasFile = path.join(corpusDir, 'canvas-bytes.json')
export const framesFile = path.join(corpusDir, 'frame-bytes.json')
export const listFile = path.join(corpusDir, 'corpus.json')

/** The resolution of every generated program case. */
export const PROGRAM_RESOLUTION = [64, 64]

const rel = file => path.relative(repoRoot, file).split(path.sep).join('/')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** A file-system-safe, stable name for a program. */
export function slug(name) {
    return String(name).normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'program'
}

/** The surface a program renders: the target of its last render(), or o0. */
export function renderSurface(dsl) {
    const targets = [...String(dsl).matchAll(/\brender\s*\(\s*(o[0-9]+)\s*\)/g)].map(match => match[1])
    return targets.at(-1) ?? 'o0'
}

/** The programs of one noisedeck list, in a stable order, each with its key. */
export function listPrograms(source, json) {
    const programs = source === 'curated' ? json.programs : json
    return Object.entries(programs)
        .filter(([, program]) => program && typeof program === 'object' && typeof program.dsl === 'string')
        .map(([key, program]) => ({ key, program }))
        .sort((a, b) => a.key.localeCompare(b.key))
}

/** The case file for one program, in the parity-case.json shape. */
export function programCase(source, key, program, manifest) {
    const pinCase = {
        schemaVersion: 1,
        source: { list: source, key, ...(source === 'curated' && typeof program.dslFile === 'string' ? { dslFile: program.dslFile } : {}) },
        effects: [...new Set(extractEffectNamesFromDsl(program.dsl, manifest).map(effect => effect.effectId))],
        dsl: program.dsl,
        surface: renderSurface(program.dsl),
        resolution: PROGRAM_RESOLUTION,
    }
    if (Array.isArray(program.effects) && program.effects.length) {
        // Inline user effects: the pin tool loads only catalog effects, so the
        // case is compared by canvas bytes, with its definitions registered.
        pinCase.userEffects = program.effects
        const glslOnly = program.effects.some(effect => Object.values(effect.shaders ?? {}).some(shader => !shader?.wgsl))
        if (glslOnly) pinCase.backends = ['webgl2']
    }
    return pinCase
}

function writeCases(programsDir) {
    const manifest = readJson(path.join(repoRoot, 'shaders/effects/manifest.json'))
    const written = []
    for (const source of ['curated', 'classic', 'basics']) {
        const json = readJson(path.join(programsDir, `${source}.json`))
        const seen = new Set()
        for (const { key, program } of listPrograms(source, json)) {
            let name = slug(source === 'curated' ? (program.code ?? key.split(':').at(-1)) : key)
            while (seen.has(name)) name = `${name}-x`
            seen.add(name)
            const file = path.join(casesDir, source, `${name}.json`)
            writeJson(file, programCase(source, key, program, manifest))
            written.push(rel(file))
        }
    }
    return written
}

/** Every catalog parity case, in a stable order. */
export function parityCases() {
    const effectsDir = path.join(repoRoot, 'shaders/effects')
    const found = []
    for (const namespace of fs.readdirSync(effectsDir).sort()) {
        const nsDir = path.join(effectsDir, namespace)
        if (!fs.statSync(nsDir).isDirectory()) continue
        for (const effect of fs.readdirSync(nsDir).sort()) {
            const file = path.join(nsDir, effect, 'parity-case.json')
            if (fs.existsSync(file)) found.push(rel(file))
        }
    }
    return found
}

/** Every generated program case, in a stable order. */
export function programCases() {
    if (!fs.existsSync(casesDir)) return []
    return fs.readdirSync(casesDir).sort().flatMap(source =>
        fs.readdirSync(path.join(casesDir, source)).filter(file => file.endsWith('.json')).sort()
            .map(file => rel(path.join(casesDir, source, file))))
}

/** The surface-pin baseline of a case. */
export function pinPath(caseFile) {
    const match = caseFile.match(/^shaders\/effects\/([^/]+)\/([^/]+)\/parity-case\.json$/)
    const name = match ? path.join('parity', `${match[1]}-${match[2]}`) : caseFile.replace(/^shaders\/tests\/fixtures\/wide-gamut\/cases\//, '').replace(/\.json$/, '')
    return rel(path.join(pinsDir, `${name}.pin.json`))
}

/** Run the pin tool on one case; resolve with its exit status and output. */
export function recordPin(caseFile) {
    // The pin tool writes its --out file without creating its directory.
    fs.mkdirSync(path.dirname(path.join(repoRoot, pinPath(caseFile))), { recursive: true })
    const result = spawnSync(process.execPath, ['shaders/scripts/pin-effect-pixels.mjs', '--case', caseFile, '--out', pinPath(caseFile)],
        { cwd: repoRoot, encoding: 'utf8', timeout: 180000 })
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ') }
}

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

/** The demo scenes of the scene line, by their committed pin cases. */
export const DEMO_SCENE_CASES = ['shaders/tests/pin-cases/scene-hello-engine.json', 'shaders/tests/pin-cases/scene-materials-lab.json']

/** Every case compared by canvas bytes: the curated programs, the demo scenes, and every case that reads media. */
export function canvasCases() {
    const curated = programCases().filter(file => file.startsWith('shaders/tests/fixtures/wide-gamut/cases/curated/'))
    const media = parityCases().filter(file => (readJson(path.join(repoRoot, file)).textureInputs ?? []).length > 0)
    return [...curated, ...DEMO_SCENE_CASES, ...media]
}

/** The backends a case runs on. */
export const caseBackends = pinCase => pinCase.backends ?? ['webgl2', 'webgpu']

// The page script that renders a case as the pin tool does: the renderer, its
// effects, the program, and the case's texture and mesh inputs.
function caseSetup(baseUrl, pinCase, preferWebGPU, colorOutput) {
    const [width, height] = pinCase.resolution
    return `const renderer = new CanvasRenderer({ canvas, width: ${width}, height: ${height}, basePath: '${baseUrl}/shaders', preferWebGPU: ${preferWebGPU}, colorOutput: '${colorOutput}' });
await renderer.loadManifest();
for (const definition of ${JSON.stringify(pinCase.userEffects ?? [])}) await renderer.registerPortableEffect(structuredClone(definition));
await renderer.loadEffects(${JSON.stringify(pinCase.effects)});
await renderer.compile(${JSON.stringify(pinCase.dsl)});
renderer.stop();
await renderer.render(0);
const matchesTargetEffectPass = ${matchesTargetEffectPass.toString()};
for (const texture of ${JSON.stringify(pinCase.textureInputs ?? [])}) {
    const source = document.createElement('canvas');
    source.width = texture.width;
    source.height = texture.height;
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(texture.data), texture.width, texture.height), 0, 0);
    const passes = renderer.pipeline.graph.passes.filter((pass) => matchesTargetEffectPass(pass, texture.effect));
    if (!passes.length) throw new Error('Texture fixture has no executing effect: ' + texture.effect);
    for (const pass of passes) {
        const textureId = pass.inputs?.[texture.uniform];
        if (typeof textureId !== 'string') throw new Error('Texture fixture uniform is not bound: ' + texture.uniform);
        const uploaded = renderer.updateTextureFromSource(textureId, source, { flipY: false });
        if (uploaded?.width !== texture.width || uploaded?.height !== texture.height) throw new Error('Texture fixture upload dimensions differ');
    }
}
${pinCase.mediaImages ? `for (const [index, file] of ${JSON.stringify(pinCase.mediaImages)}.entries()) {
    const image = new Image();
    // A WebGL2 page has an opaque origin, which a CORS request sends as
    // Origin: null; the server allows it, so the image stays untainted.
    image.crossOrigin = 'anonymous';
    image.src = '${baseUrl}/' + file;
    await image.decode();
    const uploaded = renderer.updateTextureFromSource(renderer.getMediaSteps()[index].textureId, image, { flipY: false });
    if (uploaded?.width !== image.naturalWidth || uploaded?.height !== image.naturalHeight) throw new Error('Media image did not upload: ' + file);
}
` : ''}for (const mesh of ${JSON.stringify(pinCase.meshInputs ?? [])}) {
    const loaded = await renderer.loadOBJFromURL('${baseUrl}/' + mesh.path, mesh.mesh);
    if (!loaded.success || !loaded.vertexCount) throw new Error('Mesh fixture did not load: ' + mesh.path + ' ' + (loaded.error || ''));
}
`
}

// The page renders a case as the pin tool does, then reads the presented canvas:
// WebGL2 by readPixels on the default framebuffer (premultiplied, bottom-up), and
// WebGPU by toBlob, decoded in Node (unpremultiplied, top-down).
// Under 'display-p3' the page reads the canvas copy instead (premultiplied
// floats, top-down), and with stubP3 it reports a P3 display to the renderer,
// for a browser whose display has none.
function canvasPage(baseUrl, pinCase, preferWebGPU, { colorOutput = 'srgb', stubP3 = false } = {}) {
    const [width, height] = pinCase.resolution
    const stub = stubP3 ? `const p3Query = { media: '(color-gamut: p3)', matches: true, addEventListener() {}, removeEventListener() {} };
const matchMediaOf = window.matchMedia.bind(window);
window.matchMedia = (media) => media === '(color-gamut: p3)' ? p3Query : matchMediaOf(media);` : ''
    return `<!doctype html>
<link rel="icon" href="data:,">
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
${stub}
const canvas = document.getElementById('canvas');
try {
${caseSetup(baseUrl, pinCase, preferWebGPU, colorOutput)}const backend = renderer.pipeline.backend.getName();
async function readCanvas() {
    if ('${colorOutput}' === 'display-p3') {
        if (renderer.colorOutput !== 'display-p3') throw new Error('The renderer did not take display-p3: ' + renderer.colorOutput);
        // The same frame as the srgb read: after two renders. WebGPU copies at
        // the next present; WebGL2 reads the drawing buffer as it is.
        await renderer.render(0);
        let frame;
        if (backend === 'WebGL2') {
            await renderer.render(0);
            frame = await renderer.pipeline.backend.readCanvasCopy();
        } else {
            const pending = renderer.pipeline.backend.readCanvasCopy();
            await renderer.render(0);
            frame = await pending;
        }
        const floats = frame.format === 'rgba16float'
            ? Array.from(new Uint16Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 2), (h) => {
                const e = (h >> 10) & 31, f = h & 1023, s = h >> 15 ? -1 : 1;
                return s * (e === 0 ? f * 2 ** -24 : e === 31 ? (f ? NaN : Infinity) : (1 + f / 1024) * 2 ** (e - 15));
            })
            : Array.from(new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4));
${pinCase.displaySpace ? `        // The canvas read back in Display P3, as a display shows it: through a
        // Display P3 2D canvas (WebGPU by toBlob, which drawImage needs).
        const space = document.createElement('canvas').getContext('2d', { colorSpace: 'display-p3', willReadFrequently: true });
        space.canvas.width = ${width};
        space.canvas.height = ${height};
        if (backend === 'WebGL2') space.drawImage(canvas, 0, 0);
        else space.drawImage(await createImageBitmap(await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))), 0, 0);
        const displaySpace = Array.from(space.getImageData(0, 0, ${width}, ${height}, { colorSpace: 'display-p3' }).data);
        return { method: 'canvasCopy', format: frame.format, floats, displaySpace };` : `        return { method: 'canvasCopy', format: frame.format, floats };`}
    }
    await renderer.render(0);
    await renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone?.();
    if (backend === 'WebGL2') {
        const gl = canvas.getContext('webgl2');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const data = new Uint8Array(${width} * ${height} * 4);
        gl.readPixels(0, 0, ${width}, ${height}, gl.RGBA, gl.UNSIGNED_BYTE, data);
        return { method: 'readPixels', bytes: Array.from(data) };
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return { method: 'toBlob', png: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}
const same = (a, b) => { const x = a.bytes ?? a.png ?? a.floats, y = b.bytes ?? b.png ?? b.floats; if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
// A case with settleMs is read once two consecutive readings agree, as the pin tool reads it.
const settleMs = ${JSON.stringify(pinCase.settleMs || 0)};
let result = await readCanvas();
let settled = settleMs === 0;
const settleDeadline = Date.now() + settleMs;
while (Date.now() < settleDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await readCanvas();
    if (same(next, result)) { result = next; settled = true; break; }
    result = next;
}
if (!settled) throw new Error('The canvas did not settle within ' + settleMs + ' ms');
const probe = document.createElement('canvas').getContext('webgl2');
const info = probe?.getExtension('WEBGL_debug_renderer_info');
window.canvasResult = { ...result, backend, gpu: info ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL) : '' };
} catch (error) { window.canvasResult = { error: String(error?.message ?? error) }; }
</script>`
}

// The page renders a case as canvasPage does, then reads the frame that frame
// export delivers with an srgb descriptor, in each alpha mode, through a host
// sink (renderer-output.rst), after the same two renders as the canvas read.
export const FRAME_ALPHA_MODES = ['straight', 'opaque', 'premultiplied']
function framesPage(baseUrl, pinCase, preferWebGPU) {
    const [width, height] = pinCase.resolution
    return `<!doctype html>
<link rel="icon" href="data:,">
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
const canvas = document.getElementById('canvas');
try {
${caseSetup(baseUrl, pinCase, preferWebGPU, 'srgb')}const backend = renderer.pipeline.backend.getName();
const alphaModes = ${JSON.stringify(FRAME_ALPHA_MODES)};
const errors = [];
const queues = alphaModes.map(() => renderer.createFrameExportQueue({ slots: 2, onError: (error) => errors.push(String(error?.message ?? error)) }));
let capture = false;
let frames = {};
renderer.addSink({
    configure(descriptor) { queues.forEach((queue, i) => queue.configure({ ...descriptor, colorSpace: 'srgb', alphaMode: alphaModes[i] })); },
    submit(textureId, timestamp) {
        if (!capture) return true;
        queues.forEach((queue, i) => queue.enqueue(textureId, timestamp, (frame) => { frames[alphaModes[i]] = Array.from(frame.data); }));
        return true;
    },
    close(options) { queues.forEach((queue) => queue.close(options)); }
});
async function readFrames() {
    await renderer.render(0);
    frames = {};
    capture = true;
    await renderer.render(0);
    capture = false;
    const deadline = performance.now() + 10000;
    while (Object.keys(frames).length < alphaModes.length && performance.now() < deadline) {
        queues.forEach((queue) => queue.poll());
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (errors.length) throw new Error('Frame export failed: ' + errors[0]);
    if (Object.keys(frames).length < alphaModes.length) throw new Error('Frame export did not deliver every alpha mode');
    return { method: 'frameExport', frames: { ...frames } };
}
// A case with settleMs is read once two consecutive readings agree, as the pin tool reads it.
const settleMs = ${JSON.stringify(pinCase.settleMs || 0)};
let result = await readFrames();
let settled = settleMs === 0;
const settleDeadline = Date.now() + settleMs;
while (Date.now() < settleDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const next = await readFrames();
    if (JSON.stringify(next.frames) === JSON.stringify(result.frames)) { result = next; settled = true; break; }
    result = next;
}
if (!settled) throw new Error('The frames did not settle within ' + settleMs + ' ms');
const probe = document.createElement('canvas').getContext('webgl2');
const info = probe?.getExtension('WEBGL_debug_renderer_info');
window.canvasResult = { ...result, backend, gpu: info ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL) : '' };
} catch (error) { window.canvasResult = { error: String(error?.message ?? error) }; }
</script>`
}

/** The frame record of a read-back: its size, what it holds, and its hash. */
export function frameRecord(method, width, height, bytes) {
    let nonzeroRgbPixels = 0
    const colors = new Set()
    for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i] || bytes[i + 1] || bytes[i + 2]) nonzeroRgbPixels++
        colors.add(`${bytes[i]},${bytes[i + 1]},${bytes[i + 2]},${bytes[i + 3]}`)
    }
    return { method, width, height, nonzeroRgbPixels, uniqueColors: colors.size, sha256: sha256(Buffer.from(bytes)) }
}

// Renders each case on each of its backends (or only `only`) in headless
// Chromium, reads the presented canvas, and passes each frame to `visit`:
// { caseFile, backend, method, width, height, bytes, gpu } or { caseFile, backend, error }.
// With `frames`, it reads frame export instead, and the frame carries
// `frames`, the bytes of each alpha mode. `root` is the checkout the server
// serves. `done` runs after the last backend of a case.
async function forEachCanvasFrame(cases, { only = null, visit, done = () => {}, colorOutput = 'srgb', headed = false, frames = false, root = repoRoot }) {
    const { chromium } = await import('playwright')
    const { PNG } = await import('pngjs')
    const effectsDir = path.join(root, 'shaders/effects')
    process.env.SHADE_EFFECTS_DIR = effectsDir
    process.env.SHADE_PROJECT_ROOT = root
    const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
    const baseUrl = await acquireServer(undefined, root, effectsDir)
    // Playwright launches Chromium with --force-color-profile=srgb, which would
    // make a headed browser report an sRGB display; a headed run keeps the
    // display's own profile.
    const browser = await chromium.launch({ headless: !headed, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan',
        process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan'],
        ...(headed ? { ignoreDefaultArgs: ['--force-color-profile=srgb'] } : {}) })
    try {
        for (const [index, entry] of cases.entries()) {
            const caseFile = typeof entry === 'string' ? entry : entry.id
            const pinCase = typeof entry === 'string' ? readJson(path.join(repoRoot, entry)) : entry
            const [width, height] = pinCase.resolution
            for (const backend of caseBackends(pinCase).filter(name => !only || name === only)) {
                const page = await browser.newPage({ viewport: { width, height } })
                try {
                    // WebGPU needs the page on the server's origin. A headed browser
                    // refuses to load an error response, so the page is a file that exists.
                    if (backend === 'webgpu') await page.goto(`${baseUrl}/shaders/effects/manifest.json`, { waitUntil: 'load' })
                    await page.setContent(frames
                        ? framesPage(baseUrl, pinCase, backend === 'webgpu')
                        : canvasPage(baseUrl, pinCase, backend === 'webgpu', { colorOutput, stubP3: colorOutput === 'display-p3' && !headed }), { waitUntil: 'load' })
                    await page.waitForFunction(() => window.canvasResult, null, { timeout: 60000 })
                    const result = await page.evaluate(() => window.canvasResult)
                    if (result.error) throw new Error(result.error)
                    if (result.backend.toLowerCase() !== backend) throw new Error(`expected ${backend}, got ${result.backend}`)
                    if (result.method === 'frameExport') visit({ caseFile, backend, method: 'frameExport', width, height, frames: result.frames, gpu: result.gpu })
                    else if (result.method === 'canvasCopy') visit({ caseFile, backend, method: 'canvasCopy', width, height, floats: result.floats, displaySpace: result.displaySpace, gpu: result.gpu })
                    else if (result.method === 'readPixels') visit({ caseFile, backend, method: 'readPixels', width, height, bytes: result.bytes, gpu: result.gpu })
                    else {
                        const png = PNG.sync.read(Buffer.from(result.png))
                        visit({ caseFile, backend, method: 'toBlob', width: png.width, height: png.height, bytes: png.data, gpu: result.gpu })
                    }
                } catch (error) {
                    visit({ caseFile, backend, error: String(error?.message ?? error).slice(0, 300) })
                } finally {
                    await page.close()
                }
            }
            done({ caseFile, index })
        }
    } finally {
        await browser.close()
        releaseServer()
    }
}

async function recordCanvas(cases) {
    const existing = fs.existsSync(canvasFile) ? readJson(canvasFile) : { baselines: {} }
    let failed = 0
    let entry = {}
    let gpu = ''
    await forEachCanvasFrame(cases, {
        visit: frame => {
            if (frame.error) entry[frame.backend] = { error: frame.error }
            else {
                gpu = frame.gpu
                entry[frame.backend] = frameRecord(frame.method, frame.width, frame.height, frame.bytes)
            }
        },
        done: ({ caseFile, index }) => {
            const ok = Object.values(entry).every(frame => frame.sha256 && frame.nonzeroRgbPixels > 0)
            if (!ok) failed++
            if (gpu) {
                existing.baselines[gpu] ??= {}
                existing.baselines[gpu][caseFile] = entry
            }
            console.log(`${index + 1}/${cases.length} ${ok ? 'ok' : 'FAIL'} ${caseFile}${ok ? '' : ` :: ${JSON.stringify(entry).slice(0, 300)}`}`)
            entry = {}
            gpu = ''
        },
    })
    for (const gpu of Object.keys(existing.baselines)) {
        existing.baselines[gpu] = Object.fromEntries(Object.entries(existing.baselines[gpu]).sort(([a], [b]) => a.localeCompare(b)))
    }
    writeJson(canvasFile, existing)
    return failed
}

// The srgb frame export frames of each case, in each alpha mode, keyed like
// canvas-bytes.json. At W they are recorded with --root; at a later commit a
// recording that leaves the file unchanged shows the frames byte-identical.
async function recordFrames(cases, { root = repoRoot } = {}) {
    const existing = fs.existsSync(framesFile) ? readJson(framesFile) : { baselines: {} }
    let failed = 0
    let entry = {}
    let gpu = ''
    await forEachCanvasFrame(cases, {
        frames: true,
        root,
        visit: frame => {
            if (frame.error) entry[frame.backend] = { error: frame.error }
            else {
                gpu = frame.gpu
                entry[frame.backend] = Object.fromEntries(FRAME_ALPHA_MODES.map(alphaMode =>
                    [alphaMode, frameRecord(frame.method, frame.width, frame.height, frame.frames[alphaMode])]))
            }
        },
        done: ({ caseFile, index }) => {
            const ok = Object.values(entry).every(modes => !modes.error &&
                FRAME_ALPHA_MODES.every(alphaMode => modes[alphaMode]?.sha256) && modes.straight.nonzeroRgbPixels > 0)
            if (!ok) failed++
            if (gpu) {
                existing.baselines[gpu] ??= {}
                existing.baselines[gpu][caseFile] = entry
            }
            console.log(`${index + 1}/${cases.length} ${ok ? 'ok' : 'FAIL'} ${caseFile}${ok ? '' : ` :: ${JSON.stringify(entry).slice(0, 300)}`}`)
            entry = {}
            gpu = ''
        },
    })
    for (const gpu of Object.keys(existing.baselines)) {
        existing.baselines[gpu] = Object.fromEntries(Object.entries(existing.baselines[gpu]).sort(([a], [b]) => a.localeCompare(b)))
    }
    writeJson(framesFile, existing)
    return failed
}

// An opaque sRGB color in 0 to 1 through the present conversion to Display P3
// and back (decode the sRGB curve, the sRGB-to-P3 primaries matrix, encode,
// each canvas format's quantization), from the renderer's own constants, to
// measure how a Display P3 canvas format holds the sRGB colors of a frame.
const SRGB_TO_P3 = SRGB_TO_DISPLAY_P3
const P3_TO_SRGB = DISPLAY_P3_TO_SRGB
const apply3 = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
const clamp01 = v => Math.min(1, Math.max(0, v))
/** The nearest IEEE 754 half-precision value: round to nearest, ties to even. */
export function toHalf(v) {
    if (!Number.isFinite(v) || v === 0) return v
    const a = Math.abs(v)
    if (a >= 65520) return Math.sign(v) * Infinity
    let exponent = Math.floor(Math.log2(a))
    if (2 ** exponent > a) exponent--
    else if (2 ** (exponent + 1) <= a) exponent++
    const step = 2 ** (Math.max(exponent, -14) - 10)
    const q = a / step
    let n = Math.floor(q)
    const rest = q - n
    if (rest > 0.5 || (rest === 0.5 && n % 2 === 1)) n++
    return Math.sign(v) * n * step
}

export const CANVAS_QUANTIZERS = {
    'rgba8unorm': v => Math.round(clamp01(v) * 255) / 255,
    'rgba16float': toHalf,
}

/** An 8-bit sRGB color through the present conversion into a P3 canvas format, and back. */
export function p3RoundTrip(rgb, quantize) {
    const p3 = apply3(SRGB_TO_P3, rgb.map(c => decodeSrgb(c / 255))).map(c => quantize(encodeSrgb(clamp01(c))))
    const back = apply3(P3_TO_SRGB, p3.map(decodeSrgb)).map(c => Math.round(clamp01(encodeSrgb(c)) * 255))
    return { p3, back, error: Math.max(...back.map((c, i) => Math.abs(c - rgb[i]))) }
}

/**
 * A display-p3 canvas copy, converted back to sRGB, against the srgb canvas of
 * the same case. The copy is premultiplied and top-down. The srgb read-back is
 * premultiplied and bottom-up on WebGL2 (readPixels), and unpremultiplied and
 * top-down on WebGPU (toBlob). Opaque pixels are compared in each 8-bit
 * channel. Translucent pixels are compared on premultiplied values on WebGL2,
 * and on unpremultiplied values on WebGPU, as each srgb read-back holds them.
 * A pixel whose srgb alpha is 0 is compared on alpha; on WebGL2, where the
 * srgb read-back keeps a color at alpha 0, its color is compared too
 * (zeroAlpha). On WebGL2 a translucent pixel whose color exceeds its alpha is
 * counted apart (overAlpha).
 * @returns {{opaque: object, translucent: object, overAlpha: object, zeroAlpha: object, alphaMaxError: number}}
 */
export function compareP3Frame({ srgb, p3, backend, width, height }) {
    // maxPremultipliedError is the error times alpha: on WebGL2 it is maxError;
    // on WebGPU it shows how much of maxError comes from unpremultiplying.
    const bucket = () => ({ pixels: 0, maxError: 0, overOne: 0, maxPremultipliedError: 0 })
    // On WebGL2 the srgb read-back is premultiplied, so a translucent pixel
    // whose color exceeds its alpha shows; its error is counted apart.
    const stats = { opaque: bucket(), translucent: bucket(), alphaMaxError: 0, overAlpha: { pixels: 0, maxError: 0 }, zeroAlpha: { pixels: 0, maxError: 0 } }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const j = backend === 'webgl2' ? ((height - 1 - y) * width + x) * 4 : i
            const alpha = clamp01(p3[i + 3])
            stats.alphaMaxError = Math.max(stats.alphaMaxError, Math.abs(Math.round(alpha * 255) - srgb[j + 3]))
            if (srgb[j + 3] === 0) {
                // A color at alpha 0 adds to what is behind it on a premultiplied canvas.
                // At a P3 alpha of 0 the copy holds the color as it is; at an alpha
                // below half an 8-bit step it is premultiplied, as for any alpha.
                if (backend === 'webgl2' && (srgb[j] || srgb[j + 1] || srgb[j + 2])) {
                    const color = alpha > 0 ? [0, 1, 2].map(c => p3[i + c] / alpha) : [p3[i], p3[i + 1], p3[i + 2]]
                    const shown = displayP3ToSrgb(color).map(v => Math.round(clamp01(alpha > 0 ? v * alpha : v) * 255))
                    stats.zeroAlpha.pixels++
                    stats.zeroAlpha.maxError = Math.max(stats.zeroAlpha.maxError, ...shown.map((v, c) => Math.abs(v - srgb[j + c])))
                }
                continue
            }
            const straight = alpha > 0 ? [0, 1, 2].map(c => p3[i + c] / alpha) : [0, 0, 0]
            const back = displayP3ToSrgb(straight)
            const opaque = srgb[j + 3] === 255
            // Clamped as the srgb read-back is: premultiplied on WebGL2, unpremultiplied on WebGPU.
            const scale = !opaque && backend === 'webgl2' ? alpha * 255 : 255
            // A value that is not a number counts as the largest error.
            const error = Math.max(...back.map((v, c) => {
                const step = Math.abs(Math.round(Math.min(255, Math.max(0, v * scale))) - srgb[j + c])
                return Number.isFinite(step) ? step : 255
            }))
            if (!opaque && backend === 'webgl2' && Math.max(srgb[j], srgb[j + 1], srgb[j + 2]) > srgb[j + 3]) {
                stats.overAlpha.pixels++
                stats.overAlpha.maxError = Math.max(stats.overAlpha.maxError, error)
                continue
            }
            const target = opaque ? stats.opaque : stats.translucent
            target.pixels++
            target.maxError = Math.max(target.maxError, error)
            target.maxPremultipliedError = Math.max(target.maxPremultipliedError, scale === 255 ? error * alpha : error)
            if (error > 1) target.overOne++
        }
    }
    return stats
}

/**
 * The bounds of the display-p3 round trip, in 8-bit steps, measured on the
 * corpus and frozen. Opaque pixels, translucent pixels on WebGL2
 * (premultiplied, the over-alpha ones among them) and colored pixels at alpha
 * 0 stay within one step, and alpha is exact. On WebGPU a translucent pixel is
 * compared unpremultiplied, against toBlob, where an 8-bit step of a
 * premultiplied value grows as alpha falls: translucent is the measured bound
 * of that error, and translucentPremultiplied the bound of the same error
 * times alpha.
 */
export const ROUND_TRIP_BOUNDS = Object.freeze({
    webgl2: Object.freeze({ opaque: 1, translucent: 1, translucentPremultiplied: 1, overAlpha: 1, zeroAlpha: 1, alpha: 0 }),
    webgpu: Object.freeze({ opaque: 1, translucent: 11, translucentPremultiplied: 2, overAlpha: 1, zeroAlpha: 1, alpha: 0 }),
})

/**
 * The round-trip bounds a summary of measureP3 exceeds, one line each; empty
 * when it holds them. A value that is not a number exceeds its bound, and a
 * summary with no frame fails.
 * @returns {string[]}
 */
export function roundTripExcesses(summary) {
    const bounds = ROUND_TRIP_BOUNDS[summary.backend]
    const excesses = []
    const check = (name, value, bound) => { if (!(value <= bound)) excesses.push(`${summary.backend} ${name}: ${value} > ${bound}`) }
    check('opaque', summary.opaque.maxError, bounds.opaque)
    check('translucent', summary.translucent.maxError, bounds.translucent)
    check('translucent premultiplied', summary.translucent.maxPremultipliedError, bounds.translucentPremultiplied)
    check('over-alpha', summary.overAlpha.maxError, bounds.overAlpha)
    check('zero-alpha', summary.zeroAlpha.maxError, bounds.zeroAlpha)
    check('alpha', summary.alphaMaxError, bounds.alpha)
    if (summary.failed) excesses.push(`${summary.backend}: ${summary.failed} cases failed to render`)
    if (!(summary.frames > 0)) excesses.push(`${summary.backend}: no frame was compared`)
    return excesses
}

/**
 * Programs whose colors are known in Display P3, which p3check renders in its
 * display-p3 pass after the canvas cases: Display P3 red in a program that
 * declares `gamut p3`, the same program without the directive (sRGB red), and
 * the Display P3 photo read by media() in a declared program. `expected` holds
 * one Display P3 color for the whole frame, or one per column.
 */
export const P3_REFERENCE_CASES = Object.freeze([
    {
        id: 'reference/p3-red',
        dsl: 'search synth\ngamut p3\nsolid(color: [1.0930, -0.2267, -0.1501], alpha: 1).write(o0)\nrender(o0)',
        effects: ['synth/solid'], resolution: [8, 4], displaySpace: true, outsideSrgb: true,
        expected: [[1, 0, 0]],
    },
    {
        id: 'reference/p3-red-undeclared',
        dsl: 'search synth\nsolid(color: [1.0930, -0.2267, -0.1501], alpha: 1).write(o0)\nrender(o0)',
        effects: ['synth/solid'], resolution: [8, 4], displaySpace: true, outsideSrgb: false,
        expected: [presentDisplayP3([1, 0, 0, 1]).slice(0, 3)],
    },
    {
        id: 'reference/p3-photo',
        dsl: 'search synth\ngamut p3\nmedia(imageSize: [5, 1]).write(o0)\nrender(o0)',
        effects: ['synth/media'], resolution: [5, 1], displaySpace: true, outsideSrgb: true,
        mediaImages: ['shaders/tests/fixtures/wide-gamut/display-p3-photo.png'],
        expected: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5], [0.8, 0.4, 0.2]],
    },
])

/**
 * The largest canvas copy error, in 0 to 1, and display-space error, in 8-bit
 * steps, a reference program passes with, in color and in alpha. Every
 * reference program is opaque.
 */
export const REFERENCE_BOUNDS = Object.freeze({ canvasCopy: 0.01, displaySpace: 1 })

/**
 * Checks one reference program's display-p3 frame: each pixel of the canvas
 * copy (premultiplied Display P3), unpremultiplied, and of the display-space
 * read (8-bit Display P3), against its expected Display P3 color and alpha 1;
 * and whether the frame, converted back to sRGB, lies outside sRGB.
 * @returns {{ id: string, ok: boolean, canvasCopyMaxError: number, displaySpaceMaxError: number, outsideSrgb: boolean }}
 */
export function checkReference(reference, { floats, displaySpace, width, height }) {
    let canvasCopyMaxError = 0
    let displaySpaceMaxError = displaySpace ? 0 : Infinity
    let outsideSrgb = false
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const expected = reference.expected[reference.expected.length === 1 ? 0 : x]
            const alpha = floats[i + 3]
            const rgb = [0, 1, 2].map(c => (alpha > 0 ? floats[i + c] / alpha : floats[i + c]))
            const errors = [...rgb.map((v, c) => Math.abs(v - expected[c])), Math.abs(alpha - 1)]
            for (const error of errors) canvasCopyMaxError = Math.max(canvasCopyMaxError, Number.isFinite(error) ? error : Infinity)
            if (displaySpace) {
                for (let c = 0; c < 4; c++) {
                    const error = Math.abs(displaySpace[i + c] - (c < 3 ? expected[c] : 1) * 255)
                    displaySpaceMaxError = Math.max(displaySpaceMaxError, Number.isFinite(error) ? error : Infinity)
                }
            }
            if (displayP3ToSrgb(rgb).some(v => v < -0.01 || v > 1.01)) outsideSrgb = true
        }
    }
    const ok = canvasCopyMaxError <= REFERENCE_BOUNDS.canvasCopy && displaySpaceMaxError <= REFERENCE_BOUNDS.displaySpace &&
        outsideSrgb === reference.outsideSrgb
    return { id: reference.id, ok, canvasCopyMaxError, displaySpaceMaxError, outsideSrgb }
}

/** One line for each reference program of a summary that failed its check, or did not render. */
export function referenceFailures(summary) {
    const checked = new Map((summary.references ?? []).map(result => [result.id, result]))
    return (summary.referenceIds ?? []).flatMap(id => {
        const result = checked.get(id)
        if (!result) return [`Reference program did not render: ${id}`]
        return result.ok ? [] : [`Reference program failed: ${id} (canvas copy ${result.canvasCopyMaxError}, display space ${result.displaySpaceMaxError}, outside sRGB ${result.outsideSrgb})`]
    })
}

/**
 * Every canvas case under srgb and under display-p3 on one backend, compared
 * (compareP3Frame), then each reference program under display-p3, checked
 * (checkReference).
 */
async function measureP3(cases, backend, { headed = false, references = P3_REFERENCE_CASES } = {}) {
    const srgbFrames = new Map()
    let failed = 0
    let referenceErrors = 0
    const fail = frame => { failed++; console.log(`FAIL ${frame.caseFile} :: ${frame.error}`) }
    await forEachCanvasFrame(cases, { only: backend, visit: frame => (frame.error ? fail(frame) : srgbFrames.set(frame.caseFile, frame)) })
    const frames = []
    const referenceResults = []
    const referenceById = new Map(references.map(reference => [reference.id, reference]))
    await forEachCanvasFrame([...cases, ...references], {
        only: backend,
        colorOutput: 'display-p3',
        headed,
        visit: frame => {
            if (frame.error && referenceById.has(frame.caseFile)) {
                // referenceFailures reports it; it is not a round-trip failure.
                referenceErrors++
                return console.log(`FAIL ${frame.caseFile} :: ${frame.error}`)
            }
            if (frame.error) return fail(frame)
            if (referenceById.has(frame.caseFile)) {
                const result = checkReference(referenceById.get(frame.caseFile), frame)
                referenceResults.push(result)
                console.log(`${result.ok ? 'ok' : 'FAIL'} ${result.id} :: canvas copy ${result.canvasCopyMaxError.toFixed(4)}, display space ${result.displaySpaceMaxError.toFixed(2)}, outside sRGB ${result.outsideSrgb}`)
                return
            }
            const reference = srgbFrames.get(frame.caseFile)
            if (!reference) return
            frames.push({ case: frame.caseFile, ...compareP3Frame({ srgb: reference.bytes, p3: frame.floats, backend, width: frame.width, height: frame.height }) })
        },
    })
    const sum = (key, field) => frames.reduce((total, frame) => total + frame[key][field], 0)
    const max = (key, field) => Math.max(0, ...frames.map(frame => frame[key][field]))
    const summary = {
        backend, headed, frames: frames.length, failed,
        opaque: { pixels: sum('opaque', 'pixels'), maxError: max('opaque', 'maxError'), overOne: sum('opaque', 'overOne') },
        translucent: {
            pixels: sum('translucent', 'pixels'),
            maxError: max('translucent', 'maxError'),
            overOne: sum('translucent', 'overOne'),
            maxPremultipliedError: max('translucent', 'maxPremultipliedError'),
        },
        alphaMaxError: Math.max(0, ...frames.map(frame => frame.alphaMaxError)),
        overAlpha: { pixels: frames.reduce((total, frame) => total + frame.overAlpha.pixels, 0), maxError: Math.max(0, ...frames.map(frame => frame.overAlpha.maxError)),
            frames: frames.filter(frame => frame.overAlpha.pixels > 0).length },
        zeroAlpha: { pixels: frames.reduce((total, frame) => total + frame.zeroAlpha.pixels, 0), maxError: Math.max(0, ...frames.map(frame => frame.zeroAlpha.maxError)),
            frames: frames.filter(frame => frame.zeroAlpha.pixels > 0).length },
        referenceIds: references.map(reference => reference.id),
        references: referenceResults,
        referenceErrors,
    }
    return { summary, frames }
}

/** The pixels of the Display P3 PNG fixture, left to right. */
export const P3_PHOTO_COLORS = Object.freeze([
    'color(display-p3 1 0 0)',
    'color(display-p3 0 1 0)',
    'color(display-p3 0 0 1)',
    'color(display-p3 0.5 0.5 0.5)',
    'color(display-p3 0.8 0.4 0.2)',
])

/** The banding of one frame's opaque pixels in each canvas format. */
export function frameBanding(bytes) {
    const colors = new Set()
    for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] === 255) colors.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2])
    const formats = {}
    for (const [format, quantize] of Object.entries(CANVAS_QUANTIZERS)) {
        const codes = new Set()
        let maxError = 0, overOne = 0
        for (const color of colors) {
            const { p3, error } = p3RoundTrip([color >> 16, (color >> 8) & 255, color & 255], quantize)
            codes.add(p3.join(','))
            maxError = Math.max(maxError, error)
            if (error > 1) overOne++
        }
        formats[format] = { maxError, colorsOverOne: overOne, mergedColors: colors.size - codes.size }
    }
    return { colors: colors.size, formats }
}

async function measureBanding(cases, backend = 'webgpu') {
    const frames = []
    let failed = 0
    await forEachCanvasFrame(cases, {
        only: backend,
        visit: frame => {
            if (frame.error) { failed++; console.log(`FAIL ${frame.caseFile} :: ${frame.error}`); return }
            frames.push({ case: frame.caseFile, ...frameBanding(frame.bytes) })
        },
    })
    const summary = { frames: frames.length, failed, colors: frames.reduce((sum, frame) => sum + frame.colors, 0), formats: {} }
    for (const format of Object.keys(CANVAS_QUANTIZERS)) {
        const stats = frames.map(frame => frame.formats[format])
        summary.formats[format] = {
            maxError: Math.max(0, ...stats.map(s => s.maxError)),
            colorsOverOne: stats.reduce((sum, s) => sum + s.colorsOverOne, 0),
            framesOverOne: stats.filter(s => s.colorsOverOne > 0).length,
            mergedColors: stats.reduce((sum, s) => sum + s.mergedColors, 0),
            framesWithMergedColors: stats.filter(s => s.mergedColors > 0).length,
        }
    }
    return { summary, frames }
}

export const matrixFile = path.join(corpusDir, 'browser-matrix.json')

// What each support check of shaders/src/runtime/color-output.js reports in this
// browser, on each backend. The page imports the module itself.
function matrixPage(baseUrl) {
    return `<!doctype html>
<link rel="icon" href="data:,">
<canvas id="webgpu" width="8" height="8"></canvas><canvas id="webgl2" width="8" height="8"></canvas>
<script type="module">
import * as colorOutput from '${baseUrl}/shaders/src/runtime/color-output.js';
const report = { userAgent: navigator.userAgent, display: {
    matchMediaP3: matchMedia('(color-gamut: p3)').matches,
    matchMediaSrgb: matchMedia('(color-gamut: srgb)').matches,
    displaySupportsP3: colorOutput.displaySupportsP3(window),
} };
try {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    const context = document.getElementById('webgpu').getContext('webgpu');
    if (!device || !context) throw new Error('no WebGPU device or context');
    const configuration = { device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'premultiplied' };
    report.webgpu = { hasGetConfiguration: typeof context.getConfiguration === 'function', preferredFormat: configuration.format };
    context.configure({ ...configuration, colorSpace: 'display-p3', toneMapping: { mode: 'standard' } });
    report.webgpu.readBackColorSpace = context.getConfiguration?.()?.colorSpace ?? null;
    report.webgpu.readBackToneMapping = context.getConfiguration?.()?.toneMapping?.mode ?? null;
    report.webgpu.configured = colorOutput.configureWebGPUColorOutput(context, configuration);
    report.webgpu.resolved = colorOutput.resolveColorOutput({ requested: 'display-p3', backend: 'webgpu', env: window, context, configuration });
} catch (error) { report.webgpu = { ...(report.webgpu ?? {}), error: String(error?.message ?? error) }; }
try {
    const gl = document.getElementById('webgl2').getContext('webgl2', { preserveDrawingBuffer: true });
    report.webgl2 = { hasDrawingBufferColorSpace: 'drawingBufferColorSpace' in gl, initial: gl.drawingBufferColorSpace ?? null };
    report.webgl2.configured = colorOutput.configureWebGL2ColorOutput(gl);
    report.webgl2.readBack = gl.drawingBufferColorSpace ?? null;
    report.webgl2.resolved = colorOutput.resolveColorOutput({ requested: 'display-p3', backend: 'webgl2', env: window, gl });
} catch (error) { report.webgl2 = { ...(report.webgl2 ?? {}), error: String(error?.message ?? error) }; }
window.matrixResult = report;
</script>`
}

async function recordMatrix() {
    const { chromium } = await import('playwright')
    const effectsDir = path.join(repoRoot, 'shaders/effects')
    process.env.SHADE_EFFECTS_DIR = effectsDir
    process.env.SHADE_PROJECT_ROOT = repoRoot
    const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
    const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
    const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan',
        process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan'] })
    try {
        const page = await browser.newPage()
        await page.goto(`${baseUrl}/shaders/manifest.json`, { waitUntil: 'load' })
        await page.setContent(matrixPage(baseUrl), { waitUntil: 'load' })
        await page.waitForFunction(() => window.matrixResult, null, { timeout: 60000 })
        const report = await page.evaluate(() => window.matrixResult)
        const matrix = { browser: `Chromium ${browser.version()}`, headless: true, platform: process.platform, ...report }
        writeJson(matrixFile, matrix)
        return matrix
    } finally {
        await browser.close()
        releaseServer()
    }
}

/** The bug-report and migration-fixture tests of the corpus, with the npm script that runs each. */
export const CORPUS_TESTS = [
    { id: 'test/issue-303', issue: 303, file: 'shaders/tests/test_octave_warp_render.mjs', script: 'test:shaders:render:webgl2' },
    { id: 'test/issue-304', issue: 304, file: 'shaders/tests/test-unparser.mjs', script: 'test:shaders:lang' },
    { id: 'test/issue-308', issue: 308, file: 'shaders/tests/test_media_texture_ids.mjs', script: 'test:shaders:runtime' },
    { id: 'test/issue-309', issue: 309, file: 'shaders/tests/playwright/canvas-sizing.spec.js', script: 'test:shaders:canvas-sizing', scripts: ['test:shaders:canvas-sizing', 'test:shaders:render:webgpu'] },
    { id: 'test/issue-313', issue: 313, file: 'shaders/tests/test_overlay_host_independence.mjs', script: 'test:shaders:render:webgl2' },
    { id: 'test/issue-322', issue: 322, file: 'shaders/tests/test_glsl_mod_parity.mjs', script: 'test:shaders:classic-effects' },
    { id: 'test/subchain-argument-baseline', fixture: 'shaders/tests/fixtures/subchain-argument-baseline.json', file: 'shaders/tests/test_subchain_argument_differential.js', script: 'test:shaders:lang' },
    { id: 'test/landscape-legacy-hashes', fixture: 'shaders/tests/fixtures/landscape-legacy-hashes.json', file: 'shaders/tests/test_landscape_camera.mjs', script: 'test:shaders:landscape' },
    { id: 'test/points-render-legacy-hashes', fixture: 'shaders/tests/fixtures/points-render-legacy-hashes.json', file: 'shaders/tests/test_points_render_camera.mjs', script: 'test:shaders:particles' },
]

/** The command a package script runs for one test file. */
export function testCommand(scripts, test) {
    const commands = (test.scripts ?? [test.script]).flatMap(script => {
        const parts = String(scripts[script] ?? '').split('&&').map(part => part.trim()).filter(part => part.includes(test.file.split('/').at(-1)))
        if (!parts.length) throw new Error(`${script} does not run ${test.file}`)
        return parts
    })
    return [...new Set(commands)].join(' && ')
}

const seedsOf = dsl => [...String(dsl).matchAll(/\bseed\s*:\s*(-?[0-9.]+)/g)].map(match => Number(match[1]))

// The live inputs a program reads; the corpus records them with nothing connected.
const liveInputs = dsl => [['audio', /\baudio\s*\(/], ['midi', /\bmidi\s*\(/]].filter(([, pattern]) => pattern.test(dsl))
    .map(([name]) => `${name}(): no ${name} source is connected, so it reads its default`)

/** What a case's comparisons prove about its subject. */
export function provesOf(subject, comparison) {
    const parts = []
    if (comparison.includes('surface-pin')) parts.push('its surface output on each backend')
    if (comparison.includes('canvas-bytes')) parts.push('its presented canvas bytes')
    return `${subject} keeps ${parts.join(' and ')}`
}

export const sha256File = file => sha256(fs.readFileSync(path.join(repoRoot, file)))

function caseRecord({ source, edition, W, pinCase, assets, proves }) {
    return {
        source,
        edition,
        engineBuild: W,
        dependencies: [...pinCase.effects, ...(pinCase.userEffects ?? []).map(effect => `user/${effect.func ?? effect.name}`)],
        seeds: seedsOf(pinCase.dsl),
        assets,
        inputs: [...(pinCase.textureInputs ?? []).map(texture => `${texture.effect}.${texture.uniform}: ${texture.width}x${texture.height} inline fixture`), ...liveInputs(pinCase.dsl)],
        renderSettings: { resolution: pinCase.resolution, surface: pinCase.surface, presented: renderSurface(pinCase.dsl), time: 0, backends: caseBackends(pinCase), settleMs: pinCase.settleMs ?? 0 },
        proves,
    }
}

/**
 * The corpus list, from the cases and baselines on disk.
 * @param {object} options
 * @param {string} options.W - The 2.x commit the corpus is recorded at
 * @param {string} options.gpu - The recording GPU's ANGLE renderer string
 * @param {object} options.noisedeck - { sha, files: { path: blob } }
 * @param {object} options.excluded - case path -> reason, for cases the pin tool cannot render
 * @param {object} options.scenePins - pin-baselines file -> { case, status }
 */
export function buildList({ W, gpu, lists, excluded = {}, scenePins = {}, curatedSource }) {
    const canvas = fs.existsSync(canvasFile) ? readJson(canvasFile).baselines?.[gpu] ?? {} : {}
    const canvasSet = new Set(canvasCases())
    const scripts = readJson(path.join(repoRoot, 'package.json')).scripts
    const cases = [], skipped = []
    const add = (caseFile, id, source, edition, subject, assets = []) => {
        const pinCase = readJson(path.join(repoRoot, caseFile))
        const comparison = [], baselines = {}
        const pinFile = pinPath(caseFile)
        if (fs.existsSync(path.join(repoRoot, pinFile)) && readJson(path.join(repoRoot, pinFile)).baselines?.[gpu]) {
            comparison.push('surface-pin'); baselines['surface-pin'] = pinFile
        }
        if (canvasSet.has(caseFile) && canvas[caseFile]) {
            comparison.push('canvas-bytes'); baselines['canvas-bytes'] = rel(canvasFile)
        }
        if (!comparison.length) {
            skipped.push({ id, case: caseFile, source, reason: excluded[caseFile] ?? 'no baseline was recorded' })
            return
        }
        cases.push({ id, case: caseFile, caseSha256: sha256File(caseFile), comparison, baselines, backends: caseBackends(pinCase),
            record: caseRecord({ source, edition, W, pinCase, assets, proves: provesOf(subject, comparison) }) })
    }
    for (const caseFile of parityCases()) {
        const [, namespace, effect] = caseFile.match(/^shaders\/effects\/([^/]+)\/([^/]+)\//)
        const pinCase = readJson(path.join(repoRoot, caseFile))
        add(caseFile, `parity/${namespace}/${effect}`, `noisemaker ${W} ${caseFile}`, 'Noisemaker 1.x effect parity case, recorded on the 2.x line',
            'the effect', (pinCase.meshInputs ?? []).map(mesh => mesh.path))
    }
    for (const caseFile of programCases()) {
        const pinCase = readJson(path.join(repoRoot, caseFile))
        const list = pinCase.source.list
        const program = list === 'curated' && curatedSource && pinCase.source.dslFile ? `; its DSL is ${curatedSource} ${pinCase.source.dslFile}` : ''
        add(caseFile, `${list}/${path.basename(caseFile, '.json')}`, `Noisedeck's ${list} program list (content sha256 ${lists[list]}), key ${JSON.stringify(pinCase.source.key)}${program}`,
            'Noisemaker 1.x saved program, recorded on the 2.x line', pinCase.userEffects ? 'the program, with its inline user effects,' : 'the program')
    }
    for (const caseFile of DEMO_SCENE_CASES) {
        add(caseFile, `scene-demo/${path.basename(caseFile, '.json')}`, `noisemaker ${W} ${caseFile} (the demo scene ${caseFile.includes('hello') ? 'hello-engine.dsl' : 'materials-lab.dsl'})`,
            'Noisemaker scene line demo scene (experimental), recorded on the 2.x line', 'the demo scene')
    }
    for (const [pinFile, info] of Object.entries(scenePins).sort()) {
        cases.push({ id: `scene-pin/${path.basename(pinFile, '.pin.json')}`, case: info.case, caseSha256: sha256File(info.case), comparison: ['scene-pin'], baselines: { 'scene-pin': pinFile },
            backends: ['webgl2', 'webgpu'], check: info.status,
            record: { source: `noisemaker ${W} ${pinFile}`, edition: 'Noisemaker scene line pin (experimental), recorded on the 2.x line', engineBuild: W,
                dependencies: readJson(path.join(repoRoot, info.case)).effects, seeds: seedsOf(readJson(path.join(repoRoot, info.case)).dsl), assets: [], inputs: [],
                renderSettings: { resolution: readJson(path.join(repoRoot, info.case)).resolution, surface: readJson(path.join(repoRoot, info.case)).surface, time: 0, backends: ['webgl2', 'webgpu'], settleMs: readJson(path.join(repoRoot, info.case)).settleMs ?? 0 },
                proves: 'the existing scene pin holds against its committed entry for the recording GPU' } })
    }
    for (const test of CORPUS_TESTS) {
        cases.push({ id: test.id, case: test.file, comparison: ['test'], baselines: { test: `passes at ${W}` }, command: testCommand(scripts, test),
            record: { source: test.issue ? `noisemaker ${W} ${test.file}, the regression test of noisemaker issue #${test.issue}` : `noisemaker ${W} ${test.file}, with the migration fixture ${test.fixture}`,
                edition: 'Noisemaker 1.x regression test, run on the 2.x line', engineBuild: W, dependencies: [], seeds: [], assets: test.fixture ? [test.fixture] : [], inputs: [],
                renderSettings: { scripts: test.scripts ?? [test.script] }, proves: test.issue ? `the fix for issue #${test.issue} still holds` : 'the migrated programs keep their recorded compile results and render hashes' } })
    }
    // The size of each group at W, listed or excluded, so a case cannot leave the corpus unnoticed.
    const group = entry => entry.id.split('/')[0]
    const counts = {}
    for (const entry of [...cases, ...skipped]) counts[group(entry)] = (counts[group(entry)] ?? 0) + 1
    return {
        schemaVersion: 1,
        W,
        recordingGpu: gpu,
        sources: { programLists: lists, curated: curatedSource ?? null },
        counts: Object.fromEntries(Object.entries(counts).sort()),
        cases,
        excluded: skipped,
    }
}

function flag(name) {
    const index = process.argv.indexOf(name)
    return index === -1 ? null : process.argv[index + 1]
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const command = process.argv[2]
    if (command === 'cases') {
        const programsDir = flag('--programs')
        if (!programsDir) throw new Error('cases needs --programs <dir>')
        const written = writeCases(path.resolve(programsDir))
        console.log(`wrote ${written.length} program cases`)
    } else if (command === 'pins') {
        const only = flag('--only')
        const all = [...parityCases(), ...programCases().filter(file => !readJson(path.join(repoRoot, file)).userEffects)]
        const todo = only ? all.filter(file => file.includes(only)) : all
        let failed = 0
        for (const [index, caseFile] of todo.entries()) {
            const { status, output } = recordPin(caseFile)
            if (status !== 0) failed++
            console.log(`${index + 1}/${todo.length} ${status === 0 ? 'ok' : `FAIL ${status}`} ${caseFile}${status === 0 ? '' : ` :: ${output}`}`)
        }
        console.log(`pins: ${todo.length - failed} recorded, ${failed} failed`)
        process.exitCode = failed ? 1 : 0
    } else if (command === 'list') {
        const programsDir = path.resolve(flag('--programs') ?? '')
        const W = flag('--w'), gpu = flag('--gpu')
        if (!W || !gpu) throw new Error('list needs --programs, --w and --gpu')
        const lists = Object.fromEntries(['curated', 'classic', 'basics'].map(name => [name, sha256(fs.readFileSync(path.join(programsDir, `${name}.json`)))]))
        const excluded = flag('--excluded') ? readJson(path.resolve(flag('--excluded'))) : {}
        const scenePins = flag('--scene-pins') ? readJson(path.resolve(flag('--scene-pins'))) : {}
        const curatedSource = readJson(path.join(programsDir, 'curated.json')).sourceRepository ?? null
        const list = buildList({ W, gpu, lists, excluded, scenePins, curatedSource })
        writeJson(listFile, list)
        console.log(`corpus: ${list.cases.length} cases, ${list.excluded.length} excluded`)
    } else if (command === 'matrix') {
        console.log(JSON.stringify(await recordMatrix(), null, 2))
    } else if (command === 'banding') {
        // An 8-bit or a 16-bit Display P3 canvas, modeled on the srgb frames
        // of the canvas-bytes cases on one backend. Prints the summary, and
        // writes only the --frames file when it is given.
        const only = flag('--only')
        const backend = flag('--backend') ?? 'webgpu'
        if (backend !== 'webgpu' && backend !== 'webgl2') throw new Error('banding takes --backend webgpu or webgl2')
        const todo = only ? canvasCases().filter(file => file.includes(only)) : canvasCases()
        const { summary, frames } = await measureBanding(todo, backend)
        if (flag('--frames')) writeJson(path.resolve(flag('--frames')), frames)
        console.log(JSON.stringify(summary, null, 2))
        process.exitCode = summary.failed ? 1 : 0
    } else if (command === 'p3check') {
        const only = flag('--only')
        const backend = flag('--backend') ?? 'webgpu'
        if (backend !== 'webgpu' && backend !== 'webgl2') throw new Error('p3check takes --backend webgpu or webgl2')
        const todo = only ? canvasCases().filter(file => file.includes(only)) : canvasCases()
        const references = P3_REFERENCE_CASES.filter(reference => !only || reference.id.includes(only))
        const { summary, frames } = await measureP3(todo, backend, { headed: process.argv.includes('--headed'), references })
        if (flag('--frames')) writeJson(path.resolve(flag('--frames')), frames)
        console.log(JSON.stringify(summary, null, 2))
        // A run of the reference programs alone has no canvas case to bound; a
        // run that selects nothing fails on its empty summary.
        const check = process.argv.includes('--check')
        const excesses = check && (todo.length || !references.length) ? roundTripExcesses(summary) : []
        for (const excess of excesses) console.log(`Round-trip bound exceeded: ${excess}`)
        const failures = check ? referenceFailures(summary) : []
        for (const failure of failures) console.log(failure)
        process.exitCode = summary.failed || summary.referenceErrors || excesses.length || failures.length ? 1 : 0
    } else if (command === 'p3photo') {
        const { chromium } = await import('playwright')
        const browser = await chromium.launch({ headless: true })
        try {
            const page = await browser.newPage()
            const bytes = await page.evaluate(async (colors) => {
                const canvas = new OffscreenCanvas(colors.length, 1)
                const context = canvas.getContext('2d', { colorSpace: 'display-p3' })
                colors.forEach((color, x) => { context.fillStyle = color; context.fillRect(x, 0, 1, 1) })
                return Array.from(new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()))
            }, P3_PHOTO_COLORS)
            const file = path.join(repoRoot, 'shaders/tests/fixtures/wide-gamut/display-p3-photo.png')
            fs.writeFileSync(file, Buffer.from(bytes))
            console.log(`wrote ${path.relative(repoRoot, file)}, ${bytes.length} bytes`)
        } finally {
            await browser.close()
        }
    } else if (command === 'canvas') {
        const only = flag('--only')
        const todo = only ? canvasCases().filter(file => file.includes(only)) : canvasCases()
        const failed = await recordCanvas(todo)
        console.log(`canvas: ${todo.length - failed} recorded, ${failed} failed`)
        process.exitCode = failed ? 1 : 0
    } else if (command === 'frames') {
        const only = flag('--only')
        const root = flag('--root') ? path.resolve(flag('--root')) : repoRoot
        const todo = only ? canvasCases().filter(file => file.includes(only)) : canvasCases()
        const failed = await recordFrames(todo, { root })
        console.log(`frames: ${todo.length - failed} recorded, ${failed} failed${root === repoRoot ? '' : `, served from ${root}`}`)
        process.exitCode = failed ? 1 : 0
    } else {
        console.error('Usage: wide-gamut-corpus.mjs cases|pins|canvas|frames|banding|p3check|p3photo|matrix|list')
        process.exit(2)
    }
}
