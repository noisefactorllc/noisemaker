import { test, expect } from '@playwright/test'

// The WebGPU Display P3 canvas, in headless Chromium.
// - With no stub, the renderer takes the fallback that the wide-gamut corpus's
//   browser matrix recorded for headless Chromium: no P3 gamut, so 'srgb', and
//   the canvas is configured as it is without the option.
// - With the display's gamut query stubbed to P3, Chromium configures Display
//   P3, the canvas copy reads the presented frame, and a display change
//   reconfigures the canvas at the next frame.

test.use({ headless: true })

const DSL = 'search synth\nsolid(color: [0.5, 0.25, 1], alpha: 1).write(o0)\nrender(o0)'

// A display gamut query that the page can change, as moving the window does.
const STUB_P3 = () => {
    const query = new EventTarget()
    query.media = '(color-gamut: p3)'
    query.matches = true
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = media => media === '(color-gamut: p3)' ? query : matchMedia(media)
    window.__changeGamut = matches => {
        query.matches = matches
        query.dispatchEvent(Object.assign(new Event('change'), { matches, media: query.media }))
    }
}

async function render(page, { colorOutput, stub = false }) {
    if (stub) await page.addInitScript(STUB_P3)
    await page.route('**/__webgpu-color-output__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="data:,"><canvas id="c" width="16" height="8"></canvas>'
    }))
    await page.goto('/__webgpu-color-output__')
    return page.evaluate(async ({ dsl, colorOutput }) => {
        const { CanvasRenderer } = await import('/shaders/src/index.js')
        const canvas = document.getElementById('c')
        const options = { canvas, width: 16, height: 8, basePath: '/shaders', preferWebGPU: true }
        if (colorOutput) options.colorOutput = colorOutput
        const renderer = new CanvasRenderer(options)
        window.renderer = renderer
        const before = renderer.colorOutput
        await renderer.loadManifest()
        await renderer.loadEffect('synth/solid')
        await renderer.compile(dsl)
        renderer.stop()
        await renderer.render(0)
        const backend = renderer.pipeline.backend
        const configuration = backend.context.getConfiguration()
        return {
            before,
            backend: backend.getName(),
            colorOutput: renderer.colorOutput,
            matchesP3: matchMedia('(color-gamut: p3)').matches,
            preferred: navigator.gpu.getPreferredCanvasFormat(),
            canvasFormat: backend.canvasFormat,
            configuration: {
                format: configuration.format,
                colorSpace: configuration.colorSpace,
                toneMapping: configuration.toneMapping?.mode ?? null,
                usage: configuration.usage,
                alphaMode: configuration.alphaMode,
            },
            usage: { RENDER_ATTACHMENT: GPUTextureUsage.RENDER_ATTACHMENT, COPY_DST: GPUTextureUsage.COPY_DST, COPY_SRC: GPUTextureUsage.COPY_SRC },
        }
    }, { dsl: DSL, colorOutput })
}

test('display-p3 falls back to srgb in headless Chromium, and the canvas is configured as without the option', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const result = await render(page, { colorOutput: 'display-p3' })
    expect(result.backend).toBe('WebGPU')
    expect(result.matchesP3).toBe(false)
    expect(result.before).toBe('srgb')
    expect(result.colorOutput).toBe('srgb')
    expect(result.canvasFormat).toBe(result.preferred)
    expect(result.configuration).toEqual({
        format: result.preferred,
        colorSpace: 'srgb',
        toneMapping: 'standard',
        usage: result.usage.RENDER_ATTACHMENT | result.usage.COPY_DST,
        alphaMode: 'premultiplied',
    })
    await expect(page.evaluate(() => window.renderer.pipeline.backend.readCanvasCopy())).rejects.toThrow(/display-p3/)
    expect(errors).toEqual([])
})

test('the default is srgb, configured as before', async ({ page }) => {
    const result = await render(page, { stub: true })
    expect(result.colorOutput).toBe('srgb')
    expect(result.canvasFormat).toBe(result.preferred)
    expect(result.configuration).toEqual({
        format: result.preferred,
        colorSpace: 'srgb',
        toneMapping: 'standard',
        usage: result.usage.RENDER_ATTACHMENT | result.usage.COPY_DST,
        alphaMode: 'premultiplied',
    })
})

test('on a P3 display, the canvas is Display P3 in rgba16float, and the copy holds the presented frame', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const result = await render(page, { colorOutput: 'display-p3', stub: true })
    expect(result.colorOutput).toBe('display-p3')
    expect(result.canvasFormat).toBe('rgba16float')
    expect(result.configuration).toEqual({
        format: 'rgba16float',
        colorSpace: 'display-p3',
        toneMapping: 'standard',
        usage: result.usage.RENDER_ATTACHMENT | result.usage.COPY_DST | result.usage.COPY_SRC,
        alphaMode: 'premultiplied',
    })
    const copy = await page.evaluate(async () => {
        const backend = window.renderer.pipeline.backend
        const pending = backend.readCanvasCopy()
        await window.renderer.render(0)
        const frame = await pending
        const halves = new Uint16Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 2)
        const half = bits => {
            const exponent = (bits >> 10) & 0x1f, fraction = bits & 0x3ff
            return exponent === 0 ? fraction / 1024 / 16384 : (1 + fraction / 1024) * 2 ** (exponent - 15)
        }
        const values = new Set()
        for (let i = 0; i < halves.length; i += 4) values.add([0, 1, 2, 3].map(c => half(halves[i + c]).toFixed(3)).join(','))
        return { width: frame.width, height: frame.height, format: frame.format, values: [...values] }
    })
    // The present step does not convert yet: the presented values are the program's, unchanged.
    expect(copy).toEqual({ width: 16, height: 8, format: 'rgba16float', values: ['0.500,0.250,1.000,1.000'] })
    expect(errors).toEqual([])
})

test('a display change reconfigures the canvas at the next frame', async ({ page }) => {
    await render(page, { colorOutput: 'display-p3', stub: true })
    const after = await page.evaluate(async () => {
        const renderer = window.renderer
        window.__changeGamut(false)
        const unchanged = renderer.colorOutput
        await renderer.render(0)
        const srgb = { colorOutput: renderer.colorOutput, configuration: renderer.pipeline.backend.context.getConfiguration() }
        window.__changeGamut(true)
        await renderer.render(0)
        return {
            unchanged,
            srgb: { colorOutput: srgb.colorOutput, format: srgb.configuration.format, colorSpace: srgb.configuration.colorSpace },
            p3: { colorOutput: renderer.colorOutput, format: renderer.pipeline.backend.context.getConfiguration().format },
            preferred: navigator.gpu.getPreferredCanvasFormat(),
        }
    })
    expect(after.unchanged).toBe('display-p3')
    expect(after.srgb).toEqual({ colorOutput: 'srgb', format: after.preferred, colorSpace: 'srgb' })
    expect(after.p3).toEqual({ colorOutput: 'display-p3', format: 'rgba16float' })
})
