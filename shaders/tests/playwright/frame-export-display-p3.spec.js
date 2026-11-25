import { test, expect } from '@playwright/test'

// Display P3 frame export. A display-p3 descriptor converts surface values to
// Display P3, and every frame names its color space; an srgb descriptor
// delivers the surface clamped to 0 to 1. The pipeline's own sink descriptor
// stays srgb. Headless Chromium, on both backends: Display P3 colors written
// by solid(), and the Display P3 photo read by media(), in programs that
// declare `gamut p3`.

test.use({ headless: true })

const FIXTURE = '/shaders/tests/fixtures/wide-gamut/display-p3-photo.png'
const PHOTO_WIDTH = 5
const STRAIGHT = [['srgb', 'straight'], ['display-p3', 'straight']]

const STUB_P3 = () => {
    const query = new EventTarget()
    query.media = '(color-gamut: p3)'
    query.matches = true
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = media => media === '(color-gamut: p3)' ? query : matchMedia(media)
}

// Display P3 red, and Display P3 (0.9, 0.2, 0.1), in extended sRGB.
const P3_RED = [1.0930, -0.2267, -0.1501]
const P3_ORANGE_RED = [0.9809, 0.0178, -0.0789]
const solidProgram = (declared, color, alpha = 1) =>
    `search synth\n${declared ? 'gamut p3\n' : ''}solid(color: [${color.join(', ')}], alpha: ${alpha}).write(o0)\nrender(o0)`
const photoProgram = declared => `search synth\n${declared ? 'gamut p3\n' : ''}media(imageSize: [${PHOTO_WIDTH}, 1]).write(o0)\nrender(o0)`

async function open(page) {
    await page.addInitScript(STUB_P3)
    await page.route('**/__frame-export-display-p3__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="data:,"><canvas id="c"></canvas>'
    }))
    await page.goto('/__frame-export-display-p3__')
}

// In the page: compile the program, upload the photo when it reads media,
// register a host sink that exports each submitted frame through one queue
// per [colorSpace, alphaMode] of `exports`, render, and return each frame,
// keyed 'colorSpace/alphaMode', with the descriptor the sink received.
const RUN = async ({ dsl, preferWebGPU, width, height, photo, colorOutput, exports }) => {
    const { CanvasRenderer } = await import('/shaders/src/index.js')
    const canvas = document.getElementById('c')
    canvas.width = width
    canvas.height = height
    const renderer = new CanvasRenderer({ canvas, width, height, basePath: '/shaders', preferWebGPU, colorOutput })
    await renderer.loadManifest()
    await renderer.loadEffects(['synth/solid', 'synth/media'])
    await renderer.compile(dsl)
    renderer.stop()
    let photoP3 = null
    if (photo) {
        const image = new Image()
        image.src = photo
        await image.decode()
        renderer.updateTextureFromSource(renderer.getMediaSteps()[0].textureId, image, { flipY: false })
        // The photo's own Display P3 bytes.
        const context = document.createElement('canvas').getContext('2d', { colorSpace: 'display-p3', willReadFrequently: true })
        context.canvas.width = width
        context.canvas.height = height
        context.drawImage(image, 0, 0)
        photoP3 = Array.from(context.getImageData(0, 0, width, height, { colorSpace: 'display-p3' }).data)
    }
    const errors = []
    const queues = exports.map(() => renderer.createFrameExportQueue({ slots: 2, onError: error => errors.push(String(error?.message ?? error)) }))
    const frames = {}
    const descriptors = []
    let capture = false
    const removeSink = renderer.addSink({
        configure(descriptor) {
            descriptors.push({ ...descriptor })
            queues.forEach((queue, index) => queue.configure({ ...descriptor, colorSpace: exports[index][0], alphaMode: exports[index][1] }))
        },
        submit(textureId, timestamp) {
            if (!capture) return true
            queues.forEach((queue, index) => queue.enqueue(textureId, timestamp, frame => {
                frames[exports[index].join('/')] = { colorSpace: frame.colorSpace, width: frame.width, height: frame.height, data: Array.from(frame.data) }
            }))
            return true
        },
        close(options) {
            for (const queue of queues) queue.close(options)
        }
    })
    await renderer.render(0)
    capture = true
    await renderer.render(0)
    capture = false
    const deadline = performance.now() + 5000
    while (Object.keys(frames).length < exports.length && performance.now() < deadline) {
        for (const queue of queues) queue.poll()
        await new Promise(resolve => setTimeout(resolve, 10))
    }
    const result = { backend: renderer.pipeline.backend.getName(), colorOutput: renderer.colorOutput, descriptors, frames, errors, photoP3 }
    removeSink()
    return result
}

const near = (actual, expected, label) => {
    expect(actual?.length, `${label} length`).toBe(expected.length)
    actual.forEach((value, i) => expect(Math.abs(value - expected[i]), `${label} byte ${i}: ${value} vs ${expected[i]}`).toBeLessThanOrEqual(1))
}
const fill = (pixel, count) => Array(count).fill(pixel).flat()

// exportDisplayP3 of a straight extended sRGB color, in 8-bit values.
const expectedP3 = (page, rgb, clampToSrgb) => page.evaluate(async ({ rgb, clampToSrgb }) => {
    const { exportDisplayP3 } = await import('/shaders/src/runtime/display-p3-conversion.js')
    return exportDisplayP3(rgb, { clampToSrgb })
}, { rgb, clampToSrgb })

for (const [name, preferWebGPU] of [['WebGL2', false], ['WebGPU', true]]) {
    const run = (page, options) => page.evaluate(RUN, { preferWebGPU, colorOutput: 'srgb', exports: STRAIGHT, ...options })

    test(`${name}: display-p3 frame export of a declared P3 red holds P3 red, and the frame names display-p3`, async ({ page }) => {
        await open(page)
        const result = await run(page, { dsl: solidProgram(true, P3_RED), width: 4, height: 2 })
        expect([result.backend, result.errors]).toEqual([name, []])
        const { 'srgb/straight': srgb, 'display-p3/straight': p3 } = result.frames
        expect([p3?.colorSpace, srgb?.colorSpace]).toEqual(['display-p3', 'srgb'])
        near(p3.data, fill([255, 0, 0, 255], 8), 'display-p3')
        expect(srgb.data).toEqual(fill([255, 0, 0, 255], 8))
    })

    test(`${name}: display-p3 frame export of a declared color inside Display P3 and outside sRGB keeps its P3 values`, async ({ page }) => {
        await open(page)
        const result = await run(page, { dsl: solidProgram(true, P3_ORANGE_RED), width: 4, height: 2 })
        expect(result.errors).toEqual([])
        // Display P3 (0.9, 0.2, 0.1): about (230, 51, 26). Unconverted, the
        // surface clamped is about (250, 5, 0); clamped to sRGB first, (230, 51, 35).
        near(result.frames['display-p3/straight'].data, fill([230, 51, 26, 255], 8), 'display-p3')
        near(result.frames['srgb/straight'].data, fill([250, 5, 0, 255], 8), 'srgb')
    })

    test(`${name}: without gamut p3, display-p3 frame export clamps to sRGB first`, async ({ page }) => {
        await open(page)
        const result = await run(page, { dsl: solidProgram(false, P3_RED), width: 4, height: 2 })
        expect(result.errors).toEqual([])
        const expected = (await expectedP3(page, [1, 0, 0], true)).map(c => Math.round(c * 255))
        // sRGB red in Display P3, about (234, 51, 35).
        near(result.frames['display-p3/straight'].data, fill([...expected, 255], 8), 'display-p3')
        expect(result.frames['srgb/straight'].data).toEqual(fill([255, 0, 0, 255], 8))
    })

    test(`${name}: display-p3 frame export converts before the opaque and premultiplied alpha modes`, async ({ page }) => {
        await open(page)
        const modes = ['straight', 'opaque', 'premultiplied']
        const result = await run(page, {
            dsl: solidProgram(true, P3_ORANGE_RED, 0.5), width: 4, height: 2,
            exports: modes.map(alphaMode => ['display-p3', alphaMode]),
        })
        expect(result.errors).toEqual([])
        // solid() writes premultiplied values, which frame export reads as straight.
        const p3 = await expectedP3(page, P3_ORANGE_RED.map(c => c * 0.5), false)
        const byte = c => Math.round(c * 255)
        near(result.frames['display-p3/straight'].data, fill([...p3.map(byte), 128], 8), 'straight')
        near(result.frames['display-p3/opaque'].data, fill([...p3.map(byte), 255], 8), 'opaque')
        near(result.frames['display-p3/premultiplied'].data, fill([...p3.map(c => byte(c * 0.5)), 128], 8), 'premultiplied')
        for (const mode of modes) expect(result.frames[`display-p3/${mode}`].colorSpace).toBe('display-p3')
    })

    test(`${name}: display-p3 frame export of the Display P3 photo holds its P3 colors, while the sink descriptor stays srgb`, async ({ page }) => {
        await open(page)
        const result = await run(page, { dsl: photoProgram(true), width: PHOTO_WIDTH, height: 1, photo: FIXTURE, colorOutput: 'display-p3' })
        expect([result.colorOutput, result.errors]).toEqual(['display-p3', []])
        // The pipeline's sink descriptor stays srgb on a Display P3 canvas.
        expect(result.descriptors.length).toBeGreaterThan(0)
        for (const descriptor of result.descriptors) expect(descriptor.colorSpace).toBe('srgb')
        const { 'srgb/straight': srgb, 'display-p3/straight': p3 } = result.frames
        expect([p3?.colorSpace, srgb?.colorSpace]).toEqual(['display-p3', 'srgb'])
        near(p3.data, result.photoP3, 'display-p3')
        // The srgb frame is the unconverted surface: the orange inside sRGB, at
        // about (219, 94, 31), not its P3 bytes (204, 102, 51).
        const expectedOrange = await page.evaluate(async () => {
            const { displayP3ToSrgb } = await import('/shaders/src/runtime/display-p3-conversion.js')
            return displayP3ToSrgb([0.8, 0.4, 0.2]).map(c => Math.round(c * 255))
        })
        near(srgb.data.slice(16, 19), expectedOrange, 'srgb orange')
        near(p3.data.slice(16, 19), [204, 102, 51], 'display-p3 orange')
    })
}
