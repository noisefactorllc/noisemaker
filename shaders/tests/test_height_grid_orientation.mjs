#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// Seen from directly above, heightGrid shows its diffuse image as authored:
// image right is screen right and image top is screen top, with no mirror.
// A uvMap diffuse image carries u in red and v in green, so each axis reads
// directly from the presented canvas.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const size = 128
// The grid covers these points. Each sample averages the lit
// pixels of a 7 by 7 window, so the gaps between particles do not count.
const corners = { topLeft: [44, 44], topRight: [84, 44], bottomLeft: [44, 84] }
const sample = png => Object.fromEntries(Object.entries(corners).map(([name, [cx, cy]]) => {
    const sum = [0, 0, 0]
    let lit = 0
    for (let y = cy - 3; y <= cy + 3; y++) {
        for (let x = cx - 3; x <= cx + 3; x++) {
            const i = (y * size + x) * 4
            if (png.data[i] + png.data[i + 1] + png.data[i + 2] === 0) continue
            for (let c = 0; c < 3; c++) sum[c] += png.data[i + c]
            lit++
        }
    }
    assert.ok(lit > 0, `${name}: the sample window must contain lit pixels`)
    return [name, sum.map(value => value / lit)]
}))
const across = rgb => rgb.topRight[0] - rgb.topLeft[0]
const down = rgb => rgb.bottomLeft[1] - rgb.topLeft[1]

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: size, height: size } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => {
            if (isReadbackPerformanceWarning(message.type(), message.text())) return
            if (['error', 'warning'].includes(message.type())) errors.push(message.text())
        })
        try {
            await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
            await page.setContent(`<link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block}</style><canvas width="${size}" height="${size}"></canvas>`)
            await page.evaluate(async ({ baseUrl, backend, size }) => {
                const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
                window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: size, height: size,
                    basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                await renderer.loadManifest()
                await renderer.loadEffects(['synth/testPattern', 'synth/solid', 'render/pointsEmit', 'points/heightGrid',
                    'render/pointsRender'])
            }, { baseUrl, backend, size })
            async function frame(dsl) {
                const name = await page.evaluate(async dsl => {
                    await renderer.compile(dsl)
                    renderer.stop()
                    for (let i = 0; i < 4; i++) renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    return renderer.pipeline.backend.getName().toLowerCase()
                }, dsl)
                assert.equal(name, backend, 'requested backend must execute')
                return sample(PNG.sync.read(await page.locator('canvas').screenshot()))
            }
            const image = await frame('search synth\ntestPattern(pattern: uvMap).write(o0)\nrender(o0)')
            assert.ok(Math.abs(across(image)) > 48 && Math.abs(down(image)) > 48, 'the uvMap reference must vary along both axes')
            for (const [stateSize, renderer] of [
                ['x128', 'pointsRender(viewMode: perspective, rotateX: 1.5708, density: 100, intensity: 0, inputIntensity: 0)']]) {
                const view = await frame(`search synth, points, render
testPattern(pattern: uvMap).write(o1)
solid(color: #ffffff).pointsEmit(stateSize: ${stateSize}).heightGrid(heightScale: 0, diffuseTex: read(o1)).${renderer}.write(o0)
render(o0)`)
                const label = `${backend} ${renderer.split('(')[0]}`
                assert.ok(Math.sign(across(view)) === Math.sign(across(image)) && Math.abs(across(view)) > 32,
                    `${label}: seen from above, image right must be screen right (red ${view.topLeft[0]} -> ${view.topRight[0]})`)
                assert.ok(Math.sign(down(view)) === Math.sign(down(image)) && Math.abs(down(view)) > 32,
                    `${label}: seen from above, image top must be screen top (green ${view.topLeft[1]} -> ${view.bottomLeft[1]}, authored ${image.topLeft[1]} -> ${image.bottomLeft[1]})`)
            }
            assert.deepEqual(errors, [], `${backend} console must be clean`)
            console.log(`PASS heightGrid seen from above shows its image as authored (${backend})`)
        } finally {
            await page.close()
        }
    }
} finally {
    await browser.close()
    await releaseServer()
}
