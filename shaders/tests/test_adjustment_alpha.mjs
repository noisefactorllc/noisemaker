#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

const width = 8, height = 8
const source = [64, 128, 192].map(value => value / 255)
const alphas = [0, 0.25, 0.5, 1]
const gradePrograms = ['primary', 'creative', 'wheels', 'hslSecondary', 'lut', 'vignette']
const variants = []
// Independent numeric oracles: brightness is a gain, and contrast scales
// distance from middle gray. No shader/helper implementation supplies these.
for (const [label, brightness, contrast] of [
    ['no-op', 1, 0.5],
    ['zero contrast', 1, 0],
    ['low contrast', 1, 0.25],
    ['high contrast', 1, 0.7],
    ['brightness', 1.2, 0.5],
    ['brightness and contrast', 1.2, 0.35],
]) {
    variants.push({ label: `adjust ${label}`, effect: 'adjust',
        call: `adjust(brightness: ${brightness}, contrast: ${contrast})`,
        expected: source.map(value => Math.max(0, Math.min(1,
            0.5 + (value * brightness - 0.5) * (2 * contrast)))) })
}
for (const [label, sourceHex, params] of [
    ['HSV reinterpretation', '#4080c0', 'mode: hsv'],
    ['OKLab reinterpretation', '#998563', 'mode: oklab'],
    ['OKLCH reinterpretation', '#a63366', 'mode: oklch'],
    ['hue and saturation', '#4080c0', 'rotation: 35, saturation: 0.7, hueRange: 80'],
]) {
    variants.push({ label: `adjust ${label}`, effect: 'adjust', sourceHex,
        call: `adjust(${params})` })
}

// Each non-neutral group activates a distinct grade stage. All six actual
// production passes execute; none is replaced with a test shader. Opaque
// controls supply the look, while the independently imposed coverage law
// requires that changing only alpha cannot change the underlying color.
for (const [label, params] of [
    ['no-op', ''],
    ['preset', 'preset: warmFilm, alpha: 0.6'],
    ['primary', 'temperature: 0.15, exposure: 0.2, contrast: 0.15, curveShadows: 0.05'],
    ['creative', 'vibrance: 0.2, fadedFilm: 0.15, shadowTint: [0.6, 0.45, 0.4], highlightTint: [0.45, 0.5, 0.6]'],
    ['wheels', 'wheelShadows: [0.6, 0.45, 0.5], wheelMidtones: [0.45, 0.55, 0.5], wheelHighlights: [0.5, 0.45, 0.6], wheelBalance: 0.1'],
    ['HSL', 'hslEnable: 1, hslHueCenter: 0.6, hslHueRange: 0.4, hslHueShift: 0.08, hslSatAdjust: 0.15, hslLumAdjust: 0.05'],
    ['vignette', 'vignetteAmount: 0.4, vignetteMidpoint: 0.3, vignetteFeather: 0.5, vigHiProtect: 0.2'],
]) {
    variants.push({ label: `grade ${label}`, effect: 'grade', call: `grade(${params})`,
        expected: label === 'no-op' ? source : null })
}
// Contrast -1 collapses linear RGB to middle gray. Encoding that known
// value to sRGB is an independent numeric anchor for the grade pipeline.
const middleGraySrgb = 1.055 * Math.pow(0.5, 1 / 2.4) - 0.055
variants.push({ label: 'grade black to middle gray', effect: 'grade',
    call: 'grade(contrast: -1)', sourceHex: '#000000',
    expected: [middleGraySrgb, middleGraySrgb, middleGraySrgb] })

const cases = variants.flatMap(variant => alphas.flatMap(alpha => [false, true].map(composite => ({
    variant, alpha, composite,
    label: `${variant.label}, alpha ${alpha}, ${composite ? 'over opaque blue' : 'straight PNG'}`,
    dsl: `solid(color: ${variant.sourceHex ?? '#4080c0'}, alpha: ${alpha}).${variant.call}.write(o1)\n` +
        (composite ? 'solid(color: #0000ff).blendMode(tex: read(o1), mode: mix, mix: 100).write(o0)' : 'read(o1).write(o0)'),
}))))
assert.equal(cases.length, 144, 'The complete adjustment/grade coverage matrix must execute')

let browser
const failures = []
const frames = []
const rawFrames = []
function checkPixels(actual, expectedAt, label) {
    for (let pixel = 0; pixel < width * height; pixel++) {
        const expected = expectedAt(pixel).map(value => Math.round(value * 255))
        const got = [...actual.subarray(pixel * 4, pixel * 4 + 4)]
        if (got.some((value, channel) => Math.abs(value - expected[channel]) > 1)) {
            failures.push(`${label}, pixel ${pixel}: expected ${expected}, got ${got}`)
            return
        }
    }
}

try {
    const base = await acquireServer(undefined, root, effects)
    browser = await chromium.launch(shaderTestBrowserOptions())
    for (const gpu of [false, true]) {
        const backend = gpu ? 'WebGPU' : 'WebGL2'
        const page = await browser.newPage()
        const errors = []
        try {
            await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
            page.on('pageerror', error => errors.push(error.message))
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
            await page.goto(`${base}/shaders/effects/manifest.json`)
            await page.setContent(`<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:${width},height:${height},basePath:'${base}/shaders',preferWebGPU:${gpu}});
await renderer.loadManifest();
await renderer.loadEffects(['synth/solid','mixer/blendMode','filter/adjust','filter/grade']);
window.capture = async ({dsl, effect}) => {
    await renderer.compile('search synth, mixer, filter\\n' + dsl + '\\nrender(o0)');
    renderer.render(0); renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
    const pipeline = renderer.pipeline, backend = pipeline.backend;
    const png = renderer.canvas.toDataURL();
    const surface = pipeline.surfaces.get(pipeline.graph.renderSurface);
    const raw = await backend.readPixels(pipeline.frameReadTextures?.get(pipeline.graph.renderSurface) ?? surface.read);
    const passes = pipeline.graph.passes.filter(p => p.effectFunc === effect);
    const intermediateFormats = effect === 'grade' ? passes.slice(0, -1).map(pass => {
        const texture = backend.textures.get(pass.outputs.fragColor);
        return {format:texture?.format, native:backend.gl ? texture?.glFormat?.internalFormat : texture?.handle?.format};
    }) : [];
    return {backend:backend.getName(), png, raw:{width:raw.width,height:raw.height,data:Array.from(raw.data)},
        intermediateFormats, programs:passes.map(p => p.program.slice(p.nodeId.length + 1))};
};
</script>`)
            await page.waitForFunction(() => typeof window.capture === 'function')
            const opaque = new Map()
            const pixels = []
            const rawPixels = []
            // Render opaque controls first so every fractional case has a
            // corresponding per-pixel reference, including vignette edges.
            const ordered = [...cases].sort((a, b) => Number(b.alpha === 1 && !b.composite) - Number(a.alpha === 1 && !a.composite))
            const byLabel = new Map()
            const rawByLabel = new Map()
            for (const c of ordered) {
                const result = await page.evaluate(async fixture => {
                    try { return await window.capture(fixture) }
                    catch (error) { throw new Error(JSON.stringify(error, Object.getOwnPropertyNames(error))) }
                }, { dsl: c.dsl, effect: c.variant.effect })
                assert.equal(result.backend, backend, 'Backend fallback cannot certify parity')
                assert.deepEqual(result.programs, c.variant.effect === 'grade' ? gradePrograms : ['adjust'],
                    'The intended production adjustment stages must execute')
                assert.deepEqual(result.intermediateFormats, c.variant.effect === 'grade'
                    ? Array.from({ length: 5 }, () => ({ format: 'rgba16f', native: gpu ? 'rgba16float' : 0x881A })) : [],
                    'All five private Grade intermediates must actually allocate RGBA16F, never fallback RGBA8')
                const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
                assert.deepEqual([png.width, png.height], [width, height], 'Nonempty native pixel readback')
                assert.deepEqual([result.raw.width, result.raw.height, result.raw.data.length],
                    [width, height, width * height * 4], 'Nonempty premultiplied surface readback')
                const raw = Buffer.from(result.raw.data)
                byLabel.set(c.label, png.data)
                rawByLabel.set(c.label, raw)
                if (c.alpha === 1 && !c.composite) opaque.set(c.variant.label, raw)
                const control = opaque.get(c.variant.label)
                assert.ok(control, `Missing opaque control: ${c.variant.label}`)
                checkPixels(raw, pixel => {
                    const rgb = c.variant.expected ?? [...control.subarray(pixel * 4, pixel * 4 + 3)].map(v => v / 255)
                    if (c.composite) return [rgb[0] * c.alpha, rgb[1] * c.alpha, rgb[2] * c.alpha + 1 - c.alpha, 1]
                    return [...rgb.map(value => value * c.alpha), c.alpha]
                }, `${backend} premultiplied ${c.label}`)
                // PNG stores straight RGB, but the browser first quantizes
                // its premultiplied canvas to RGBA8. At alpha .25 a single
                // premultiplied byte spans four straight-color bytes. Check
                // the raw coverage law above, then this independent byte
                // unpremultiplication law; do not widen straight tolerances.
                checkPixels(png.data, pixel => {
                    const offset = pixel * 4, alphaByte = raw[offset + 3]
                    assert.equal(alphaByte, Math.round((c.composite ? 1 : c.alpha) * 255), 'Coverage is preserved')
                    return alphaByte ? [0, 1, 2].map(channel => Math.min(1, raw[offset + channel] / alphaByte))
                        .concat(alphaByte / 255) : [0, 0, 0, 0]
                }, `${backend} quantized PNG ${c.label}`)
            }
            // A missing/ignored grade parameter must not pass the covariance
            // test just because every alpha saw the same neutral pipeline.
            const neutral = opaque.get('grade no-op')
            for (const variant of variants.filter(v => v.effect === 'grade' && v.label !== 'grade no-op')) {
                const control = opaque.get(variant.label)
                assert.ok(control.some((value, i) => i % 4 !== 3 && Math.abs(value - neutral[i]) > 2),
                    `${backend} ${variant.label} must visibly alter its opaque control`)
            }
            for (const variant of variants.filter(v => v.effect === 'adjust' && !v.expected)) {
                const input = variant.sourceHex.slice(1).match(/../g).map(value => parseInt(value, 16))
                assert.ok(opaque.get(variant.label).some((value, i) => i % 4 !== 3 && Math.abs(value - input[i % 4]) > 2),
                    `${backend} ${variant.label} must visibly alter the source, not silently ignore its parameters`)
            }
            const vignette = opaque.get('grade vignette')
            assert.ok([...vignette.subarray(0, 3)].some((v, c) => Math.abs(v - vignette[(4 * width + 4) * 4 + c]) > 2),
                `${backend} vignette must exercise spatially varying pixels`)
            for (const c of cases) {
                pixels.push(byLabel.get(c.label))
                rawPixels.push(rawByLabel.get(c.label))
            }
            assert.equal(pixels.length, cases.length)
            assert.deepEqual(errors, [], `${backend} browser errors`)
            frames.push(pixels)
            rawFrames.push(rawPixels)
            console.log(`${backend}: rendered ${cases.length} adjustment/grade alpha cases`)
        } finally {
            await page.close()
        }
    }
    let parityFailures = 0
    for (let i = 0; i < cases.length; i++) {
        if (!rawFrames[0][i].equals(rawFrames[1][i])) {
            failures.push(`Exact GLSL/WGSL premultiplied pixels: ${cases[i].label}`)
        }
        if (!frames[0][i].equals(frames[1][i])) {
            parityFailures++
            const channel = frames[0][i].findIndex((value, j) => value !== frames[1][i][j])
            failures.push(`Exact GLSL/WGSL parity ${cases[i].label}, byte ${channel}: ${frames[0][i][channel]} != ${frames[1][i][channel]}`)
        }
    }
    for (const failure of failures) console.error(failure)
    assert.equal(failures.length, 0, `${failures.length} pixel-oracle/parity failures; ${parityFailures} cases differ between GLSL/WGSL`)
    console.log(`Exact adjustment/grade pixel parity: ${cases.length} cases; zero differing bytes`)
} finally {
    try { await browser?.close() } finally { await releaseServer() }
}
