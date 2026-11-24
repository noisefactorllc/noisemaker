import { test, expect } from '@playwright/test'

// Display P3 media. A program that declares `gamut p3` decodes media in
// Display P3 and keeps its colors outside sRGB; every other program uploads
// media as before. Headless Chromium, with the display's gamut query reporting
// P3, on both backends. The fixture is display-p3-photo.png: P3 red, P3 green,
// P3 blue, P3 middle gray, and an orange inside sRGB whose P3 and sRGB values
// differ, one pixel each.

test.use({ headless: true })

const FIXTURE = '/shaders/tests/fixtures/wide-gamut/display-p3-photo.png'
const P3_COLORS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5], [0.8, 0.4, 0.2]]
const WIDTH = P3_COLORS.length

const STUB_P3 = () => {
    const query = new EventTarget()
    query.media = '(color-gamut: p3)'
    query.matches = true
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = media => media === '(color-gamut: p3)' ? query : matchMedia(media)
}

const program = declared => `search synth\n${declared ? 'gamut p3\n' : ''}media(imageSize: [${WIDTH}, 1]).write(o0)\nrender(o0)`

// Browsers without the Display P3 decode: a WebGL2 context without
// unpackColorSpace, and a getImageData() that answers in srgb.
const NO_UNPACK_COLOR_SPACE = () => { delete WebGL2RenderingContext.prototype.unpackColorSpace }
const SRGB_IMAGE_DATA = () => {
    const getImageData = CanvasRenderingContext2D.prototype.getImageData
    CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) { return getImageData.call(this, x, y, w, h, { colorSpace: 'srgb' }) }
}

async function open(page, extra = null) {
    await page.addInitScript(STUB_P3)
    if (extra) await page.addInitScript(extra)
    await page.route('**/__media-display-p3__', route => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><link rel="icon" href="data:,"><canvas id="c" width="${WIDTH}" height="1"></canvas>`
    }))
    await page.goto('/__media-display-p3__')
}

// In the page: make the renderer once, then compile a program, optionally
// upload a source to its media input, render, and read back the canvas copy
// (shown in sRGB), the 8-bit read of the surface media() writes (as the pin
// tool reads a surface), and the media texture's format.
const RUN = async ({ dsl, preferWebGPU, fixture, width, upload = 'image' }) => {
    const { CanvasRenderer } = await import('/shaders/src/index.js')
    const { displayP3ToSrgb } = await import('/shaders/src/runtime/display-p3-conversion.js')
    let renderer = window.renderer
    if (!renderer) {
        renderer = new CanvasRenderer({ canvas: document.getElementById('c'), width, height: 1, basePath: '/shaders', preferWebGPU, colorOutput: 'display-p3' })
        window.renderer = renderer
        await renderer.loadManifest()
        await renderer.loadEffect('synth/media')
    }
    await renderer.compile(dsl)
    renderer.stop()
    const [step] = renderer.getMediaSteps()
    if (upload === 'image') {
        const image = new Image()
        image.src = fixture
        await image.decode()
        window.fixtureImage = image
        renderer.updateTextureFromSource(step.textureId, image, { flipY: false })
    } else if (upload === 'p3-canvas' || upload === 'srgb-canvas') {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = 1
        const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: upload === 'p3-canvas' ? 'display-p3' : 'srgb' })
        context.drawImage(window.fixtureImage, 0, 0)
        renderer.updateTextureFromSource(step.textureId, canvas, { flipY: false, context2d: context })
    }
    await renderer.render(0)
    const backend = renderer.pipeline.backend
    let frame
    if (backend.getName() === 'WebGL2') {
        await renderer.render(0)
        frame = await backend.readCanvasCopy()
    } else {
        const pending = backend.readCanvasCopy()
        await renderer.render(0)
        frame = await pending
    }
    const half = bits => {
        const e = (bits >> 10) & 31, f = bits & 1023, s = bits >> 15 ? -1 : 1
        return s * (e === 0 ? f * 2 ** -24 : (1 + f / 1024) * 2 ** (e - 15))
    }
    const values = frame.format === 'rgba16float'
        ? Array.from(new Uint16Array(frame.data.buffer, frame.data.byteOffset, width * 4), half)
        : Array.from(new Float32Array(frame.data.buffer, frame.data.byteOffset, width * 4))
    const surface = renderer.pipeline.surfaces.get('o0')
    let surfaceBytes = []
    for (const id of [surface?.read, surface?.write].filter(Boolean)) {
        const bytes = Array.from((await backend.readPixels(id))?.data ?? [])
        if (bytes.some(Boolean)) { surfaceBytes = bytes.slice(0, width * 4); break }
    }
    const srgbDecode = (() => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = 1
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(window.fixtureImage, 0, 0)
        return Array.from(context.getImageData(0, 0, width, 1).data)
    })()
    return {
        backend: backend.getName(),
        textureFormat: backend.textures.get(step.textureId)?.format,
        unpackColorSpace: backend.gl?.unpackColorSpace ?? null,
        shown: [...Array(width).keys()].map(x => displayP3ToSrgb(values.slice(x * 4, x * 4 + 3))),
        surfaceBytes,
        srgbDecode,
    }
}

const expectP3Colors = (shown, expected) => shown.forEach((pixel, x) =>
    pixel.forEach((channel, c) => expect(Math.abs(channel - expected[x][c]), `pixel ${x} channel ${c}`).toBeLessThan(0.01)))

for (const [name, preferWebGPU] of [['WebGL2', false], ['WebGPU', true]]) {
    const run = (page, options) => page.evaluate(RUN, { preferWebGPU, fixture: FIXTURE, width: WIDTH, ...options })

    test(`${name}: a declared program shows the P3 photo in its own colors, outside sRGB where they are`, async ({ page }) => {
        await open(page)
        const expected = await page.evaluate(async colors => {
            const { displayP3ToSrgb } = await import('/shaders/src/runtime/display-p3-conversion.js')
            return colors.map(displayP3ToSrgb)
        }, P3_COLORS)
        const result = await run(page, { dsl: program(true) })
        expect([result.backend, result.textureFormat]).toEqual([name, 'rgba16f'])
        expectP3Colors(result.shown, expected)
        // P3 red and P3 green lie outside sRGB.
        expect(result.shown[0][1]).toBeLessThan(-0.15)
        expect(result.shown[1][0]).toBeLessThan(-0.3)
        if (name === 'WebGL2') expect(result.unpackColorSpace).toBe('srgb')
    })

    test(`${name}: an undeclared program uploads the photo as before, also after a Display P3 upload`, async ({ page }) => {
        await open(page)
        const plain = await run(page, { dsl: program(false) })
        expect(plain.textureFormat).toBe('rgba8')
        // The default upload holds the browser's own srgb decode of the image.
        expect(plain.surfaceBytes).toEqual(plain.srgbDecode)
        await run(page, { dsl: program(true) })
        const after = await run(page, { dsl: program(false) })
        expect(after.textureFormat).toBe('rgba8')
        expect(after.surfaceBytes).toEqual(plain.surfaceBytes)
        if (name === 'WebGL2') expect(after.unpackColorSpace).toBe('srgb')
    })

    test(`${name}: a compile that adds or removes gamut p3 decodes the uploaded photo again`, async ({ page }) => {
        await open(page)
        const plain = await run(page, { dsl: program(false) })
        const expected = await page.evaluate(async colors => {
            const { displayP3ToSrgb } = await import('/shaders/src/runtime/display-p3-conversion.js')
            return colors.map(displayP3ToSrgb)
        }, P3_COLORS)
        // No upload by the host: the renderer decodes the kept photo again.
        const declared = await run(page, { dsl: program(true), upload: null })
        expect(declared.textureFormat).toBe('rgba16f')
        expectP3Colors(declared.shown, expected)
        const undeclared = await run(page, { dsl: program(false), upload: null })
        expect(undeclared.textureFormat).toBe('rgba8')
        expect(undeclared.surfaceBytes).toEqual(plain.surfaceBytes)
    })

    test(`${name}: a willReadFrequently Display P3 canvas decodes in Display P3, and an srgb canvas keeps the default upload`, async ({ page }) => {
        await open(page)
        await run(page, { dsl: program(false) })
        const expected = await page.evaluate(async colors => {
            const { displayP3ToSrgb } = await import('/shaders/src/runtime/display-p3-conversion.js')
            return colors.map(displayP3ToSrgb)
        }, P3_COLORS)
        const p3Canvas = await run(page, { dsl: program(true), upload: 'p3-canvas' })
        expect(p3Canvas.textureFormat).toBe('rgba16f')
        // The canvas holds the photo in 8-bit Display P3.
        p3Canvas.shown.forEach((pixel, x) => pixel.forEach((channel, c) => expect(Math.abs(channel - expected[x][c])).toBeLessThan(0.01)))
        const srgbCanvas = await run(page, { dsl: program(true), upload: 'srgb-canvas' })
        expect(srgbCanvas.textureFormat).toBe('rgba8')
    })

    if (name === 'WebGL2') {
        test('WebGL2: a context without unpackColorSpace keeps the default upload in a declared program', async ({ page }) => {
            await open(page, NO_UNPACK_COLOR_SPACE)
            const result = await run(page, { dsl: program(true) })
            expect(result.textureFormat).toBe('rgba8')
            expect(result.surfaceBytes).toEqual(result.srgbDecode)
        })
    } else {
        test('WebGPU: a getImageData() that answers in srgb keeps the default upload, upload after upload', async ({ page }) => {
            await open(page, SRGB_IMAGE_DATA)
            await run(page, { dsl: program(false) })
            const first = await run(page, { dsl: program(true), upload: 'p3-canvas' })
            const second = await run(page, { dsl: program(true), upload: 'p3-canvas' })
            for (const result of [first, second]) {
                expect(result.textureFormat).toBe('rgba8')
                expect(result.surfaceBytes.some(Boolean)).toBe(true)
            }
            expect(second.surfaceBytes).toEqual(first.surfaceBytes)
        })
    }
}
