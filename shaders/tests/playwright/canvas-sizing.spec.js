import { test, expect } from '@playwright/test'

// Regression tests for issue #309: CanvasRenderer width/height options must
// size an unsized canvas element, and must leave a host-sized element alone.
// The page renders through WebGL2 (SwiftShader in CI) exactly as a host
// would, then reads the element size and the exported PNG's IHDR dimensions.

test.use({ headless: true })

const SIZE_DSL = 'search synth\nnoise().write(o0)\nrender(o0)'

async function renderAndMeasure(page, canvasAttrs) {
    await page.route('**/__canvas-sizing__', route => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><link rel="icon" href="data:,"><canvas id="c" ${canvasAttrs}></canvas>`
    }))
    await page.goto('/__canvas-sizing__')
    return page.evaluate(async ({ dsl }) => {
        const { CanvasRenderer } = await import('/shaders/src/index.js')
        const canvas = document.getElementById('c')
        const renderer = new CanvasRenderer({
            canvas,
            width: 640,
            height: 360,
            basePath: '/shaders'
        })
        await renderer.loadManifest()
        await renderer.loadEffect('synth/noise')
        await renderer.compile(dsl)
        renderer.stop()
        await renderer.render(0.25)
        const url = canvas.toDataURL('image/png')
        const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), c => c.charCodeAt(0))
        const view = new DataView(bytes.buffer)
        return { element: [canvas.width, canvas.height], png: [view.getUint32(16), view.getUint32(20)] }
    }, { dsl: SIZE_DSL })
}

test('width/height options size an unsized canvas element so exports match the render resolution', async ({ page }) => {
    const result = await renderAndMeasure(page, '')
    expect(result.element).toEqual([640, 360])
    expect(result.png).toEqual([640, 360])
})

test('a host-sized canvas element keeps its size and a disagreement is diagnosed', async ({ page }) => {
    const warnings = []
    page.on('console', message => {
        if (message.type() === 'warning') warnings.push(message.text())
    })
    const result = await renderAndMeasure(page, 'width="320" height="240"')
    expect(result.element).toEqual([320, 240])
    expect(result.png).toEqual([320, 240])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('320x240')
    expect(warnings[0]).toContain('640x360')
})

test('a host-sized canvas element matching the options stays silent', async ({ page }) => {
    const warnings = []
    page.on('console', message => {
        if (message.type() === 'warning') warnings.push(message.text())
    })
    const result = await renderAndMeasure(page, 'width="640" height="360"')
    expect(result.element).toEqual([640, 360])
    expect(result.png).toEqual([640, 360])
    expect(warnings).toHaveLength(0)
})
