import { test, expect } from '@playwright/test'

// The srgb fallback of a renderer that asks for Display P3, on both backends,
// under two conditions:
// - The display check false. Chromium's color profile is forced to Display P3
//   (--force-color-profile=display-p3-d65), so the display check is true, as
//   a control test shows; the page then stubs it false.
// - An sRGB display. Chromium keeps Playwright's default
//   --force-color-profile=srgb, which overrides the host's own display
//   profile and reports no P3 gamut; the test reads that report.
// Under each, the renderer reports srgb, the canvas is configured as an srgb
// canvas, and programs whose colors lie outside sRGB show them clamped to
// sRGB: Display P3 red in a program that declares `gamut p3` and in one that
// does not, and the Display P3 photo read by media() in a declared program,
// which still decodes in Display P3.

test.use({ headless: true })

const FIXTURE = '/shaders/tests/fixtures/wide-gamut/display-p3-photo.png'

// The project's launch arguments, with the color profile forced to Display P3
// in place of Playwright's default srgb, for a headless browser of its own.
const p3Profile = () => ({
    headless: true,
    args: [...(test.info().project.use.launchOptions?.args ?? []), '--force-color-profile=display-p3-d65'],
    ignoreDefaultArgs: ['--force-color-profile=srgb'],
})

// The fixture's pixels as the browser decodes them into an srgb canvas:
// P3 red, green and blue clipped to sRGB, its 8-bit gray, and the orange
// inside sRGB.
const PHOTO_SRGB = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [127, 127, 127, 255], [219, 94, 31, 255]].flat()

// Display P3 red, in extended sRGB.
const P3_RED = 'solid(color: [1.0930, -0.2267, -0.1501], alpha: 1).write(o0)'
const PROGRAMS = {
    'declared P3 red': { dsl: `search synth\ngamut p3\n${P3_RED}\nrender(o0)`, width: 8, height: 4 },
    'undeclared P3 red': { dsl: `search synth\n${P3_RED}\nrender(o0)`, width: 8, height: 4 },
    'declared P3 photo': { dsl: 'search synth\ngamut p3\nmedia(imageSize: [5, 1]).write(o0)\nrender(o0)', width: 5, height: 1, photo: FIXTURE },
}

// Records the display's own report, then reports no P3 gamut.
const STUB_NO_P3 = () => {
    const matchMedia = window.matchMedia.bind(window)
    window.unstubbedDisplayP3 = matchMedia('(color-gamut: p3)').matches
    const query = new EventTarget()
    query.media = '(color-gamut: p3)'
    query.matches = false
    window.matchMedia = media => media === '(color-gamut: p3)' ? query : matchMedia(media)
}

async function open(page, stub) {
    if (stub) await page.addInitScript(STUB_NO_P3)
    await page.route('**/__wide-gamut-fallback__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="data:,"><canvas id="c"></canvas>'
    }))
    await page.goto('/__wide-gamut-fallback__')
}

// In the page: render the program on a renderer that asks for Display P3, and
// return what the renderer reports, the canvas configuration, the media
// texture's format, the canvas read as an srgb canvas reads back (WebGL2 by
// readPixels on the default framebuffer, WebGPU by toBlob, top-down), and the
// browser's own srgb decode of the photo.
const RUN = async ({ dsl, width, height, photo, preferWebGPU }) => {
    const { CanvasRenderer } = await import('/shaders/src/index.js')
    const canvas = document.getElementById('c')
    canvas.width = width
    canvas.height = height
    const renderer = new CanvasRenderer({ canvas, width, height, basePath: '/shaders', preferWebGPU, colorOutput: 'display-p3' })
    await renderer.loadManifest()
    await renderer.loadEffects(['synth/solid', 'synth/media'])
    await renderer.compile(dsl)
    renderer.stop()
    let textureFormat = null
    let photoSrgb = null
    if (photo) {
        const image = new Image()
        image.src = photo
        await image.decode()
        const { textureId } = renderer.getMediaSteps()[0]
        renderer.updateTextureFromSource(textureId, image, { flipY: false })
        textureFormat = renderer.pipeline.backend.textures.get(textureId)?.format ?? null
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
        context.canvas.width = width
        context.canvas.height = height
        context.drawImage(image, 0, 0)
        photoSrgb = Array.from(context.getImageData(0, 0, width, height).data)
    }
    await renderer.render(0)
    await renderer.render(0)
    const backend = renderer.pipeline.backend
    await backend.device?.queue?.onSubmittedWorkDone?.()
    let configuration
    let bytes
    if (backend.getName() === 'WebGL2') {
        const gl = backend.gl
        configuration = { colorSpace: gl.drawingBufferColorSpace, srgbFormat: gl.drawingBufferFormat === gl.RGBA8 }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        const raw = new Uint8Array(width * height * 4)
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
        bytes = []
        for (let y = height - 1; y >= 0; y--) bytes.push(...raw.subarray(y * width * 4, (y + 1) * width * 4))
    } else {
        const current = backend.context.getConfiguration()
        configuration = { colorSpace: current.colorSpace, srgbFormat: current.format === navigator.gpu.getPreferredCanvasFormat() }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
        context.canvas.width = width
        context.canvas.height = height
        context.drawImage(await createImageBitmap(blob), 0, 0)
        bytes = Array.from(context.getImageData(0, 0, width, height).data)
    }
    return {
        backend: backend.getName(),
        colorOutput: renderer.colorOutput,
        displayP3: window.matchMedia('(color-gamut: p3)').matches,
        unstubbedDisplayP3: window.unstubbedDisplayP3 ?? null,
        configuration,
        textureFormat,
        photoSrgb,
        bytes,
    }
}

const near = (actual, expected, label) => {
    expect(actual.length, `${label} length`).toBe(expected.length)
    actual.forEach((value, i) => expect(Math.abs(value - expected[i]), `${label} byte ${i}: ${value} vs ${expected[i]}`).toBeLessThanOrEqual(1))
}

// The fallback checks of one program, on one backend.
async function expectFallback(page, name, program, { dsl, width, height, photo }, preferWebGPU, { stubbed }) {
    const result = await page.evaluate(RUN, { dsl, width, height, photo, preferWebGPU })
    expect([result.backend, result.colorOutput, result.displayP3]).toEqual([name, 'srgb', false])
    // With the stub, the display itself reports P3, so only the stub makes the check false.
    expect(result.unstubbedDisplayP3).toBe(stubbed ? true : null)
    expect(result.configuration).toEqual({ colorSpace: 'srgb', srgbFormat: true })
    if (photo) {
        // The declared program still decodes the photo in Display P3, and the
        // canvas shows it as the browser's own srgb decode of the image.
        expect(result.textureFormat).toBe('rgba16f')
        near(result.photoSrgb, PHOTO_SRGB, 'the fixture')
        near(result.bytes, result.photoSrgb, program)
    } else {
        near(result.bytes, Array(width * height).fill([255, 0, 0, 255]).flat(), program)
    }
}

// Runs `fn` with a page of a headless browser launched with p3Profile().
async function withP3Profile(playwright, baseURL, fn) {
    const browser = await playwright.chromium.launch(p3Profile())
    try {
        const page = await (await browser.newContext({ baseURL })).newPage()
        await fn(page)
    } finally {
        await browser.close()
    }
}

for (const [name, preferWebGPU] of [['WebGL2', false], ['WebGPU', true]]) {
    test.describe(`${name}, with the display check false`, () => {
        test(`${name}: under the forced Display P3 profile, without a stub, the renderer takes display-p3`, async ({ playwright, baseURL }) => withP3Profile(playwright, baseURL, async page => {
            await open(page, false)
            const { dsl, width, height } = PROGRAMS['declared P3 red']
            const result = await page.evaluate(async ({ dsl, width, height, preferWebGPU }) => {
                const { CanvasRenderer } = await import('/shaders/src/index.js')
                const canvas = document.getElementById('c')
                const renderer = new CanvasRenderer({ canvas, width, height, basePath: '/shaders', preferWebGPU, colorOutput: 'display-p3' })
                await renderer.loadManifest()
                await renderer.loadEffects(['synth/solid'])
                await renderer.compile(dsl)
                renderer.stop()
                await renderer.render(0)
                return { backend: renderer.pipeline.backend.getName(), colorOutput: renderer.colorOutput, displayP3: window.matchMedia('(color-gamut: p3)').matches }
            }, { dsl, width, height, preferWebGPU })
            expect(result).toEqual({ backend: name, colorOutput: 'display-p3', displayP3: true })
        }))

        for (const [program, settings] of Object.entries(PROGRAMS)) {
            test(`${name}, with the display check false: the ${program} falls back to srgb, clamped to sRGB`, async ({ playwright, baseURL }) => withP3Profile(playwright, baseURL, async page => {
                await open(page, true)
                await expectFallback(page, name, program, settings, preferWebGPU, { stubbed: true })
            }))
        }
    })

    test.describe(`${name}, on an sRGB display`, () => {
        for (const [program, settings] of Object.entries(PROGRAMS)) {
            test(`${name}, on an sRGB display: the ${program} falls back to srgb, clamped to sRGB`, async ({ page }) => {
                await open(page, false)
                await expectFallback(page, name, program, settings, preferWebGPU, { stubbed: false })
            })
        }
    })
}
