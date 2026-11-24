import { test, expect } from '@playwright/test'

// The WebGL2 Display P3 canvas, in headless Chromium.
// - With no stub, the renderer takes the fallback that the wide-gamut corpus's
//   browser matrix recorded for headless Chromium: no P3 gamut, so 'srgb', and
//   the drawing buffer is left as it is without the option.
// - With the display's gamut query stubbed to P3, the drawing buffer is
//   Display P3 in a 16-bit float format, the canvas copy reads the presented
//   frame, a display change sets the buffer again at the next frame, and a
//   rebuild after a lost context sets the same space on the new context.

test.use({ headless: true })

const DSL = 'search synth\nsolid(color: [0.5, 0.25, 1], alpha: 1).write(o0)\nrender(o0)'

// The program's color, through the present conversion, as the reference implementation gives it.
const CONVERTED = page => page.evaluate(async () => (await import('/shaders/src/runtime/display-p3-conversion.js')).presentDisplayP3([0.5, 0.25, 1, 1]))

// A 16-bit float canvas holds each value within half a step of its 10-bit
// fraction; the copy's values are printed to 3 decimals.
const expectConverted = (value, expected) => value.split(',').map(Number).forEach((channel, index) =>
    expect(Math.abs(channel - expected[index])).toBeLessThanOrEqual(2 ** -10 + 5e-4))

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

// What the page's renderer and its drawing buffer report.
const STATE = () => {
    const renderer = window.renderer
    const gl = renderer.pipeline.backend.gl
    return {
        backend: renderer.pipeline.backend.getName(),
        colorOutput: renderer.colorOutput,
        colorSpace: gl.drawingBufferColorSpace,
        format: gl.drawingBufferFormat,
        RGBA8: gl.RGBA8,
        RGBA16F: gl.RGBA16F,
    }
}

async function render(page, { colorOutput, stub = false }) {
    if (stub) await page.addInitScript(STUB_P3)
    await page.route('**/__webgl2-color-output__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="data:,"><div id="host"><canvas id="c" width="16" height="8"></canvas></div>'
    }))
    await page.goto('/__webgl2-color-output__')
    return page.evaluate(async ({ dsl, colorOutput }) => {
        const { CanvasRenderer } = await import('/shaders/src/index.js')
        const canvas = document.getElementById('c')
        const options = { canvas, canvasContainer: document.getElementById('host'), width: 16, height: 8, basePath: '/shaders', preferWebGPU: false }
        if (colorOutput) options.colorOutput = colorOutput
        const renderer = new CanvasRenderer(options)
        window.renderer = renderer
        const before = renderer.colorOutput
        await renderer.loadManifest()
        await renderer.loadEffect('synth/solid')
        await renderer.compile(dsl)
        renderer.stop()
        await renderer.render(0)
        return { before, matchesP3: matchMedia('(color-gamut: p3)').matches }
    }, { dsl: DSL, colorOutput })
}

// The values of the canvas copy, as one string per distinct pixel.
const COPY_VALUES = async () => {
    const frame = await window.renderer.pipeline.backend.readCanvasCopy()
    const floats = new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4)
    const values = new Set()
    for (let i = 0; i < floats.length; i += 4) values.add([0, 1, 2, 3].map(c => floats[i + c].toFixed(3)).join(','))
    return { width: frame.width, height: frame.height, format: frame.format, values: [...values] }
}

test('display-p3 falls back to srgb in headless Chromium, and the drawing buffer is as without the option', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const result = await render(page, { colorOutput: 'display-p3' })
    expect(result.matchesP3).toBe(false)
    expect(result.before).toBe('srgb')
    const state = await page.evaluate(STATE)
    expect(state.backend).toBe('WebGL2')
    expect(state.colorOutput).toBe('srgb')
    expect(state.colorSpace).toBe('srgb')
    expect(state.format).toBe(state.RGBA8)
    await expect(page.evaluate(() => window.renderer.pipeline.backend.readCanvasCopy())).rejects.toThrow(/display-p3/)
    expect(errors).toEqual([])
})

test('the default is srgb, in the 8-bit drawing buffer', async ({ page }) => {
    await render(page, { stub: true })
    const state = await page.evaluate(STATE)
    expect(state.colorOutput).toBe('srgb')
    expect(state.colorSpace).toBe('srgb')
    expect(state.format).toBe(state.RGBA8)
})

test('on a P3 display, the drawing buffer is Display P3 in 16-bit float, and the copy holds the presented frame', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await render(page, { colorOutput: 'display-p3', stub: true })
    const state = await page.evaluate(STATE)
    expect(state.colorOutput).toBe('display-p3')
    expect(state.colorSpace).toBe('display-p3')
    expect(state.format).toBe(state.RGBA16F)
    // The present step converts: the drawing buffer holds the program's color in Display P3.
    const copy = await page.evaluate(COPY_VALUES)
    expect([copy.width, copy.height, copy.format, copy.values.length]).toEqual([16, 8, 'rgba32float', 1])
    expectConverted(copy.values[0], await CONVERTED(page))
    expect(errors).toEqual([])
})

test('a display change sets the drawing buffer again at the next frame', async ({ page }) => {
    await render(page, { colorOutput: 'display-p3', stub: true })
    const unchanged = await page.evaluate(() => { window.__changeGamut(false); return window.renderer.colorOutput })
    expect(unchanged).toBe('display-p3')
    await page.evaluate(() => window.renderer.render(0))
    const srgb = await page.evaluate(STATE)
    expect([srgb.colorOutput, srgb.colorSpace, srgb.format]).toEqual(['srgb', 'srgb', srgb.RGBA8])
    await page.evaluate(() => { window.__changeGamut(true); return window.renderer.render(0) })
    const p3 = await page.evaluate(STATE)
    expect([p3.colorOutput, p3.colorSpace, p3.format]).toEqual(['display-p3', 'display-p3', p3.RGBA16F])
})

test('a rebuild after a lost context sets Display P3 on the new context', async ({ page }) => {
    await render(page, { colorOutput: 'display-p3', stub: true })
    await page.evaluate(() => {
        const gl = window.renderer.pipeline.backend.gl
        window.__oldContext = gl
        const lose = gl.getExtension('WEBGL_lose_context')
        lose.loseContext()
        setTimeout(() => lose.restoreContext(), 50)
    })
    await page.waitForFunction(() => {
        const pipeline = window.renderer.pipeline
        return pipeline && pipeline.backend.gl !== window.__oldContext && !window.renderer.isContextLost
    }, null, { timeout: 20000 })
    const state = await page.evaluate(STATE)
    expect([state.colorOutput, state.colorSpace, state.format]).toEqual(['display-p3', 'display-p3', state.RGBA16F])
})

test('the retry on a fresh canvas, after a lost context that is not restored, sets Display P3 on the new context', async ({ page }) => {
    await render(page, { colorOutput: 'display-p3', stub: true })
    await page.evaluate(() => {
        const gl = window.renderer.pipeline.backend.gl
        window.__oldContext = gl
        gl.getExtension('WEBGL_lose_context').loseContext()
    })
    await page.waitForFunction(() => {
        const pipeline = window.renderer.pipeline
        return pipeline && pipeline.backend.gl !== window.__oldContext && !window.renderer.isContextLost
    }, null, { timeout: 30000 })
    const state = await page.evaluate(STATE)
    expect([state.colorOutput, state.colorSpace, state.format]).toEqual(['display-p3', 'display-p3', state.RGBA16F])
})
