// The demo opened with ?backend=wgsl sizes its canvas to its layout, as it
// does on WebGL2 and after a backend tab switch. The backend switch replaces
// the canvas element, and the page must resize the new one: the old one kept
// its start-up size and no longer followed the window.
import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { startPortableViewerServer } from '../../scripts/lib/portable-viewer-server.mjs'

async function canvasState(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('canvas')
        const container = document.getElementById('canvas-container')
        const style = getComputedStyle(container)
        const width = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const height = container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        return {
            backend: window.__noisemakerCurrentBackend(),
            canvas: [canvas.width, canvas.height],
            // The demo's own rule: a square of the smaller side, 64 to 2048.
            fit: Math.floor(Math.max(64, Math.min(width, height, 2048))),
        }
    })
}

test('the demo sizes its canvas to its layout on each backend, and follows a resize', async () => {
    const { server, origin } = await startPortableViewerServer()
    const browser = await chromium.launch(shaderTestBrowserOptions())
    try {
        for (const backend of ['glsl', 'wgsl']) {
            const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
            const errors = []
            page.on('pageerror', error => errors.push(error.message))
            await page.goto(`${origin}/demo/shaders/index.html?backend=${backend}`)
            await page.waitForFunction(() => /pipeline loaded successfully/.test(document.getElementById('status').textContent),
                null, { timeout: 60000 })
            const loaded = await canvasState(page)
            assert.equal(loaded.backend, backend, `the demo runs on ${backend}`)
            assert.deepEqual(loaded.canvas, [loaded.fit, loaded.fit], `${backend}: the canvas fits the layout`)
            await page.setViewportSize({ width: 700, height: 520 })
            await page.waitForFunction(() => {
                const canvas = document.getElementById('canvas')
                return canvas.width === canvas.height
            })
            await page.waitForTimeout(250)
            const resized = await canvasState(page)
            assert.notEqual(resized.fit, loaded.fit, 'the resize changes the layout')
            assert.deepEqual(resized.canvas, [resized.fit, resized.fit], `${backend}: the canvas follows the resize`)
            assert.deepEqual(errors, [])
            await page.close()
        }
    } finally {
        await browser.close()
        await new Promise(resolve => server.close(resolve))
    }
})
