import { test, expect } from '@playwright/test'

// A program that declares `gamut p3` keeps its colors outside sRGB on a
// Display P3 canvas; the same program without the directive is clamped to
// sRGB. Headless Chromium, with the display's gamut query reporting P3, on
// both backends: the canvas copy holds what the canvas presents.

test.use({ headless: true })

const STUB_P3 = () => {
    const query = new EventTarget()
    query.media = '(color-gamut: p3)'
    query.matches = true
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = media => media === '(color-gamut: p3)' ? query : matchMedia(media)
}

// Display P3 red, in extended sRGB.
const P3_RED = 'solid(color: [1.0930, -0.2267, -0.1501], alpha: 1).write(o0)'
const program = declared => `search synth\n${declared ? 'gamut p3\n' : ''}${P3_RED}\nrender(o0)`

async function readBack(page, { preferWebGPU, declared }) {
    await page.addInitScript(STUB_P3)
    await page.route('**/__gamut-p3__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="data:,"><canvas id="c" width="8" height="4"></canvas>'
    }))
    await page.goto('/__gamut-p3__')
    return page.evaluate(async ({ dsl, preferWebGPU }) => {
        const { CanvasRenderer } = await import('/shaders/src/index.js')
        const { displayP3ToSrgb } = await import('/shaders/src/runtime/display-p3-conversion.js')
        const canvas = document.getElementById('c')
        const renderer = new CanvasRenderer({ canvas, width: 8, height: 4, basePath: '/shaders', preferWebGPU, colorOutput: 'display-p3' })
        await renderer.loadManifest()
        await renderer.loadEffect('synth/solid')
        await renderer.compile(dsl)
        renderer.stop()
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
            ? Array.from(new Uint16Array(frame.data.buffer, frame.data.byteOffset, 4), half)
            : Array.from(new Float32Array(frame.data.buffer, frame.data.byteOffset, 4))
        return { backend: backend.getName(), colorOutput: renderer.colorOutput, p3: values, srgb: displayP3ToSrgb(values.slice(0, 3)) }
    }, { dsl: program(declared), preferWebGPU })
}

for (const [name, preferWebGPU] of [['WebGL2', false], ['WebGPU', true]]) {
    test(`${name}: a declared program's Display P3 red reads back outside sRGB`, async ({ page }) => {
        const result = await readBack(page, { preferWebGPU, declared: true })
        expect([result.backend, result.colorOutput]).toEqual([name, 'display-p3'])
        // The canvas holds P3 red; back in sRGB it is over 1 in red and below 0 in green and blue.
        expect(result.p3[0]).toBeGreaterThan(0.99)
        expect(Math.max(result.p3[1], result.p3[2])).toBeLessThan(0.01)
        expect(result.srgb[0]).toBeGreaterThan(1.05)
        expect(result.srgb[1]).toBeLessThan(-0.15)
        expect(result.srgb[2]).toBeLessThan(-0.1)
    })

    test(`${name}: the same program without the directive reads back clamped to sRGB`, async ({ page }) => {
        const result = await readBack(page, { preferWebGPU, declared: false })
        expect([result.backend, result.colorOutput]).toEqual([name, 'display-p3'])
        // sRGB red: inside sRGB once converted back, within the canvas format's precision.
        for (const [channel, value] of [[0, 1], [1, 0], [2, 0]]) expect(Math.abs(result.srgb[channel] - value)).toBeLessThan(0.01)
    })
}
