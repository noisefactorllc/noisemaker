import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(baseUrl)
    await page.setContent('<style>body{margin:0}canvas{display:block}</style><canvas></canvas>')
    await page.evaluate(async baseUrl => {
        const { WebGPUBackend } = await import(`${baseUrl}/shaders/src/runtime/backends/webgpu.js`)
        const adapter = await navigator.gpu.requestAdapter()
        const device = await adapter.requestDevice()
        const canvas = document.querySelector('canvas')
        const context = canvas.getContext('webgpu')
        context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'premultiplied' })
        window.presentBackend = new WebGPUBackend(device, context)
        await presentBackend.init()
    }, baseUrl)
    // 0x3bfc is exactly 0.998046875: its 8-bit value rounds to 255, but
    // interpolation with an adjacent black texel can incorrectly produce 254.
    const width = 160, height = 128
    const data = [], expected = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const rgb = [(x + y) % 2, (x * 3 + y) % 5 === 0, (x + y * 7) % 3 === 0]
        data.push(...rgb.map(value => value ? 0x3bfc : 0), 0x3c00)
    }
    for (let y = height - 1; y >= 0; y--) for (let x = 0; x < width; x++) {
        expected.push(...data.slice((y * width + x) * 4, (y * width + x + 1) * 4).map(value => value ? 255 : 0))
    }
    async function present(sourceWidth, sourceHeight, targetWidth, targetHeight, values) {
        await page.evaluate(async ({ sourceWidth, sourceHeight, targetWidth, targetHeight, values }) => {
            const backend = presentBackend
            const canvas = document.querySelector('canvas')
            canvas.width = targetWidth; canvas.height = targetHeight
            backend.destroyTexture('present-fixture')
            const texture = backend.createTexture('present-fixture', {
                width: sourceWidth, height: sourceHeight, format: 'rgba16f'
            })
            backend.queue.writeTexture({ texture }, new Uint16Array(values),
                { bytesPerRow: sourceWidth * 8 }, { width: sourceWidth, height: sourceHeight })
            backend.present('present-fixture')
            await backend.queue.onSubmittedWorkDone()
        }, { sourceWidth, sourceHeight, targetWidth, targetHeight, values })
        return PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
    }
    assert.equal((await present(width, height, width, height, data)).equals(Buffer.from(expected)), true,
        'same-size presentation must preserve every source texel and its orientation')
    const corners = [0x3c00,0,0,0x3c00, 0,0x3c00,0,0x3c00,
        0,0,0x3c00,0x3c00, 0x3c00,0x3c00,0x3c00,0x3c00]
    const scaled = await present(2, 2, 3, 3, corners)
    assert.deepEqual(Array.from(scaled.subarray(16, 20)), [128,128,128,255],
        'scaled presentation must retain linear interpolation')
    assert.deepEqual(Array.from(scaled.subarray(0, 4)), [0,0,255,255],
        'scaled presentation must retain its vertical orientation')
    assert.equal((await present(width, height, width, height, data)).equals(Buffer.from(expected)), true,
        'returning from scaled to same-size presentation must restore exact texels')
    assert.deepEqual(errors, [])
    await page.evaluate(() => presentBackend.destroy())
    console.log('PASS WebGPU presentation: exact texels, scaled filtering, orientation, and resize transitions')
} finally {
    await browser.close()
    await releaseServer()
}
