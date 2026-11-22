#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// Seen from directly above, heightGrid shows its diffuse image as authored:
// image right is screen right and image top is screen top, with no mirror,
// and in the proportions of the frame. A uvMap diffuse image carries
// u in red and v in green, so each axis reads directly from the presented
// canvas.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
// A square frame, a wide one and a tall one. The surfaces have the frame's
// shape. The grid is gridScale wide. Each grid here fits inside its frame, with
// few enough particles on a pixel that the summed colors still differ from one
// sampled point to the next.
const frames = [
    { width: 128, height: 128, gridScale: 80, stateSize: 'x128' },
    { width: 256, height: 128, gridScale: 80, stateSize: 'x64' },
    { width: 128, height: 256, gridScale: 50, stateSize: 'x128' },
]
// The box of the lit pixels of a frame.
const litBox = png => {
    const box = { x0: png.width, x1: -1, y0: png.height, y1: -1 }
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const i = (y * png.width + x) * 4
            if (png.data[i] + png.data[i + 1] + png.data[i + 2] < 24) continue
            box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x)
            box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y)
        }
    }
    assert.ok(box.x1 >= box.x0, 'the frame must contain lit pixels')
    return { ...box, width: box.x1 - box.x0 + 1, height: box.y1 - box.y0 + 1 }
}
// Points inside the box, toward its corners. Each sample averages the lit pixels of a 7 by 7
// window, so the gaps between particles do not count.
const sample = (png, box) => {
    const dx = Math.round(box.width * 0.27), dy = Math.round(box.height * 0.27)
    const corners = {
        topLeft: [box.x0 + dx, box.y0 + dy], topRight: [box.x1 - dx, box.y0 + dy], bottomLeft: [box.x0 + dx, box.y1 - dy]
    }
    return Object.fromEntries(Object.entries(corners).map(([name, [cx, cy]]) => {
        const sum = [0, 0, 0]
        let lit = 0
        for (let y = cy - 3; y <= cy + 3; y++) {
            for (let x = cx - 3; x <= cx + 3; x++) {
                const i = (y * png.width + x) * 4
                if (png.data[i] + png.data[i + 1] + png.data[i + 2] === 0) continue
                for (let c = 0; c < 3; c++) sum[c] += png.data[i + c]
                lit++
            }
        }
        assert.ok(lit > 0, `${name}: the sample window must contain lit pixels`)
        return [name, sum.map(value => value / lit)]
    }))
}
const across = rgb => rgb.topRight[0] - rgb.topLeft[0]
const down = rgb => rgb.bottomLeft[1] - rgb.topLeft[1]

// Every backend and frame is measured before the verdict on the proportions.
const outOfProportion = []
try {
    for (const backend of ['webgl2', 'webgpu']) {
        for (const { width, height, gridScale, stateSize } of frames) {
            const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
            const errors = []
            page.on('pageerror', error => errors.push(error.message))
            page.on('console', message => {
                if (isReadbackPerformanceWarning(message.type(), message.text())) return
                if (['error', 'warning'].includes(message.type())) errors.push(message.text())
            })
            try {
                await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
                await page.setContent(`<link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas>`)
                await page.evaluate(async ({ baseUrl, backend, width, height }) => {
                    const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
                    window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width, height,
                        basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                    await renderer.loadManifest()
                    await renderer.loadEffects(['synth/testPattern', 'synth/solid', 'render/pointsEmit', 'points/heightGrid',
                        'render/pointsRender'])
                }, { baseUrl, backend, width, height })
                async function frame(dsl) {
                    const name = await page.evaluate(async dsl => {
                        await renderer.compile(dsl)
                        renderer.stop()
                        for (let i = 0; i < 4; i++) renderer.render(0)
                        await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                        return renderer.pipeline.backend.getName().toLowerCase()
                    }, dsl)
                    assert.equal(name, backend, 'requested backend must execute')
                    const png = PNG.sync.read(await page.locator('canvas').screenshot())
                    const box = litBox(png)
                    return { box, rgb: sample(png, box) }
                }
                const image = (await frame('search synth\ntestPattern(pattern: uvMap).write(o0)\nrender(o0)')).rgb
                assert.ok(Math.abs(across(image)) > 48 && Math.abs(down(image)) > 48, 'the uvMap reference must vary along both axes')
                const renderer = 'pointsRender(viewMode: perspective, rotateX: 1.5708, density: 100, intensity: 0, inputIntensity: 0)'
                const { box, rgb: view } = await frame(`search synth, points, render
testPattern(pattern: uvMap).write(o1)
solid(color: #ffffff).pointsEmit(stateSize: ${stateSize}).heightGrid(gridScale: ${gridScale}, heightScale: 0, diffuseTex: read(o1)).${renderer}.write(o0)
render(o0)`)
                const label = `${backend} ${width} x ${height}`
                assert.ok(box.x0 > 0 && box.y0 > 0 && box.x1 < width - 1 && box.y1 < height - 1,
                    `${label}: the grid must fit inside the frame (x ${box.x0} to ${box.x1}, y ${box.y0} to ${box.y1})`)
                assert.ok(Math.sign(across(view)) === Math.sign(across(image)) && Math.abs(across(view)) > 32,
                    `${label}: seen from above, image right must be screen right (red ${view.topLeft[0]} -> ${view.topRight[0]})`)
                assert.ok(Math.sign(down(view)) === Math.sign(down(image)) && Math.abs(down(view)) > 32,
                    `${label}: seen from above, image top must be screen top (green ${view.topLeft[1]} -> ${view.bottomLeft[1]}, authored ${image.topLeft[1]} -> ${image.bottomLeft[1]})`)
                const shape = width / height
                if (Math.abs(box.width / box.height - shape) > shape * 0.1) {
                    outOfProportion.push(`${label}: seen from above, the grid is ${box.width} by ${box.height} pixels, and its frame is ${width} by ${height}`)
                }
                assert.deepEqual(errors, [], `${backend} console must be clean`)
            } finally {
                await page.close()
            }
        }
        if (!outOfProportion.some(line => line.startsWith(backend))) {
            console.log(`PASS heightGrid seen from above shows its image as authored, in the frame's proportions (${backend})`)
        }
    }
    assert.deepEqual(outOfProportion, [])
} finally {
    await browser.close()
    await releaseServer()
}
