#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// A scene shows a 2D program as it was authored, on either backend. Each case
// renders through CanvasRenderer on the presented canvas, with the backend
// asserted in the page.
//
// reflectionProbe: a mirror shows what is in the direction it reflects, and
// WebGPU draws the frame WebGL2 draws. The materials lab demo scene, which
// lights its metals from a probe, is held to the same.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const size = 128

// Mean of one channel over a rectangle of the frame, rows top first.
function mean(png, x0, y0, x1, y1, channel) {
    let sum = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += png.data[(y * size + x) * 4 + channel]
    return sum / ((x1 - x0) * (y1 - y0))
}

// A mirror sphere over a red floor that emits, under a black sky. The lower
// half of the sphere reflects the floor and the upper half the sky.
const mirror = `search synth
scene(
  background: [0, 0, 0], ambient: 0, ssao: 0,
  reflectionProbe: [0, 0, 3], reflectionProbeSize: 128,
  camera(fov: 30, pos: [0, 0, 6], target: [0, 0, 0]),
  mesh("plane", width: 40, height: 40, pos: [0, -1.3, 0])
    .material(solid(color: [1, 0, 0]).emit(strength: 1)),
  mesh("sphere", radius: 1, segments: 48)
    .material(solid(color: [1, 1, 1]).pbr(metallic: 1, roughness: 0.05))
).write(o0)
render(o0)`

// The demo scene as its pixel pin renders it.
const materialsLab = JSON.parse(fs.readFileSync(path.join(root, 'shaders/tests/pin-cases/scene-materials-lab.json'), 'utf8'))

const cases = [
    {
        name: 'reflectionProbe shows the floor in the lower half of a mirror sphere',
        dsl: mirror,
        // The probe fills all six faces on the first frame and then one a
        // frame; the sphere is in its own probe, so the frame settles later.
        frames: 12,
        matchWebGL2: true,
        check(view, label) {
            const red = (bottom, top) => {
                const px = f => Math.round((f + 1) / 2 * size)
                return mean(view, px(-0.15), px(-top), px(0.15), px(-bottom), 0)
            }
            const [upper, lower] = [red(0.15, 0.45), red(-0.45, -0.15)]
            assert.ok(lower > 96 && upper < 16,
                `${label}: the lower half must reflect the red floor and the upper half the black sky ` +
                `(red ${lower.toFixed(0)} below, ${upper.toFixed(0)} above)`)
        },
    },
    {
        name: 'the materials lab scene',
        dsl: materialsLab.dsl,
        effects: materialsLab.effects,
        frames: 12,
        matchWebGL2: true,
    },
]

// The largest difference between two frames, and how much of the frame differs.
function difference(a, b) {
    let max = 0
    let differing = 0
    for (let i = 0; i < a.data.length; i += 4) {
        let pixel = 0
        for (let c = 0; c < 3; c++) pixel = Math.max(pixel, Math.abs(a.data[i + c] - b.data[i + c]))
        if (pixel > 0) differing++
        max = Math.max(max, pixel)
    }
    return { max, percent: differing / (size * size) * 100 }
}

const failures = []
const webgl2Frames = new Map()
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
            }, { baseUrl, backend, size })
            async function frame(dsl, frames = 2, effects = []) {
                const name = await page.evaluate(async ({ dsl, frames, effects }) => {
                    await renderer.loadEffects(effects)
                    await renderer.dispose()
                    await renderer.compile(dsl)
                    renderer.stop()
                    for (let i = 0; i < frames; i++) await renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    return renderer.pipeline.backend.getName().toLowerCase()
                }, { dsl, frames, effects })
                assert.equal(name, backend, 'requested backend must execute')
                return PNG.sync.read(await page.locator('canvas').screenshot())
            }
            for (const c of cases) {
                const label = `${backend} ${c.name}`
                try {
                    const view = await frame(c.dsl, c.frames, c.effects)
                    c.check?.(view, label)
                    if (c.matchWebGL2 && backend === 'webgl2') webgl2Frames.set(c.name, view)
                    if (c.matchWebGL2 && backend === 'webgpu') {
                        const { max, percent } = difference(view, webgl2Frames.get(c.name))
                        assert.ok(max <= 2, `${label}: WebGPU must draw the frame WebGL2 draws ` +
                            `(largest difference ${max}, ${percent.toFixed(2)}% of pixels differ)`)
                    }
                    console.log(`PASS ${label}`)
                } catch (error) {
                    failures.push(error.message)
                    console.log(`FAIL ${error.message}`)
                }
            }
            assert.deepEqual(errors, [], `${backend} console must be clean`)
        } finally {
            await page.close()
        }
    }
} finally {
    await browser.close()
    await releaseServer()
}
assert.deepEqual(failures, [], `${failures.length} scene orientation case(s) failed`)
