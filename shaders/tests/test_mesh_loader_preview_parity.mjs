#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effectsDir = path.join(root, 'shaders/effects')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = effectsDir
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, effectsDir)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = new Map()

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: 64, height: 64 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(`${baseUrl}/shaders/tests/blank.html`)
        const capture = await page.evaluate(async ({ baseUrl, backend }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            const canvas = document.createElement('canvas')
            canvas.width = 64
            canvas.height = 64
            document.body.append(canvas)
            const renderer = new CanvasRenderer({ canvas, width: 64, height: 64,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await renderer.loadManifest()
            await renderer.loadEffects(['render/meshLoader'])
            await renderer.compile('search render\nmeshLoader().write(o0)\nrender(o0)')
            renderer.stop()
            renderer.render(0)
            const loaded = await renderer.loadOBJFromURL(`${baseUrl}/share/meshes/cube.obj`, 'mesh0')
            if (!loaded.success || !loaded.vertexCount) throw new Error(`cube mesh did not load: ${loaded.error || ''}`)
            renderer.render(0)
            renderer.render(0)
            await renderer.pipeline.backend.waitForIdle?.()
            const surface = renderer.pipeline.surfaces.get('o0')
            const pixels = await renderer.pipeline.backend.readPixels(surface.read)
            await renderer.dispose()
            return { name: backend, width: pixels.width, height: pixels.height, data: Array.from(pixels.data) }
        }, { baseUrl, backend })
        assert.deepEqual(errors, [], `${backend} console errors`)
        captures.set(backend, capture)
        await page.close()
    }

    const webgl = captures.get('webgl2')
    const webgpu = captures.get('webgpu')
    const uniqueRgb = capture => new Set(Array.from({ length: capture.data.length / 4 }, (_, index) =>
        capture.data.slice(index * 4, index * 4 + 3).join(','))).size
    assert.ok(uniqueRgb(webgl) > 1, 'WebGL2 meshLoader preview must show uploaded mesh data')
    assert.ok(uniqueRgb(webgpu) > 1, 'WebGPU meshLoader preview must show uploaded mesh data')
    assert.deepEqual([webgpu.width, webgpu.height], [webgl.width, webgl.height])
    for (let y = 0; y < webgl.height; y++) {
        for (let x = 0; x < webgl.width; x++) {
            const gl = (y * webgl.width + x) * 4
            const gpu = ((webgpu.height - 1 - y) * webgpu.width + x) * 4
            assert.deepEqual(webgpu.data.slice(gpu, gpu + 4), webgl.data.slice(gl, gl + 4),
                `meshLoader preview differs at ${x},${y}`)
        }
    }
    console.log('meshLoader preview parity: ok')
} finally {
    await browser.close()
    releaseServer()
}
