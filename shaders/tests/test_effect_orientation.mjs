#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// Effects show their input as authored: never mirrored or flipped, on either
// backend. Each case renders through CanvasRenderer on the presented canvas,
// with the backend asserted in the page, and compares the output with the
// authored image. testPattern(pattern: uvMap) carries u in red and v in green,
// so red rises to the right and green rises to the top of the presented frame.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const size = 128
const uvMap = 'testPattern(pattern: uvMap)'

const at = (png, x, y) => Array.from(png.data.subarray((y * size + x) * 4, (y * size + x) * 4 + 3))
function meanAbsDiff(a, b) {
    let sum = 0
    for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c])
    return sum / (size * size * 3)
}
// Mean of f(red, green) over the lit pixels in a band of the frame.
function litMean(png, x0, y0, x1, y1, f) {
    let sum = 0
    let lit = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const rgb = at(png, x, y)
        if (rgb[0] + rgb[1] + rgb[2] < 24) continue
        sum += f(rgb[0], rgb[1])
        lit++
    }
    assert.ok(lit > 16, `band ${x0},${y0}-${x1},${y1} must contain lit pixels`)
    return sum / lit
}

const particleSims = ['attractor', 'buddhabrot', 'dla', 'flock', 'flow', 'hydraulic', 'lenia', 'life', 'physarum', 'physical']
const cases = [
    // Each particle effect passes its input through for pointsRender to draw
    // under the trails. With the trails off, the frame is the input itself.
    ...particleSims.map(sim => ({
        name: `points/${sim} passes its input through upright`,
        effects: [`points/${sim}`, 'render/pointsEmit', 'render/pointsRender'],
        dsl: `search points, render, synth
${uvMap}.pointsEmit(stateSize: x64).${sim}().pointsRender(density: 0, inputIntensity: 100, intensity: 0).write(o0)
render(o0)`,
        check(view, authored, label) {
            const diff = meanAbsDiff(view, authored)
            assert.ok(diff <= 2, `${label}: the background must be the authored input (mean difference ${diff.toFixed(2)})`)
        },
    })),
    // Each particle effect moves and colours its particles from the input at
    // their own positions, so WebGPU must draw the particles WebGL2 draws.
    ...particleSims.map(sim => ({
        name: `points/${sim} draws the particles WebGL2 draws`,
        effects: [`points/${sim}`, 'render/pointsEmit', 'render/pointsRender'],
        frames: 8,
        matchWebGL2: true,
        dsl: `search points, render, synth
${uvMap}.pointsEmit(stateSize: x64).${sim}().pointsRender(density: 100, intensity: 100, inputIntensity: 0).write(o0)
render(o0)`,
    })),
    // Life colours each particle from the input at its own position, so the
    // particles at the top of the frame carry the top of the input. Additive
    // deposits saturate, so each band compares green against red: the uvMap
    // is greener than red along its top edge and redder along its bottom edge,
    // and redder than green along its right edge.
    {
        name: 'points/life colours its particles from the input upright',
        effects: ['points/life', 'render/pointsEmit', 'render/pointsRender'],
        dsl: `search points, render, synth
${uvMap}.pointsEmit(stateSize: x128).life().pointsRender(density: 100, intensity: 20, inputIntensity: 0).write(o0)
render(o0)`,
        check(view, authored, label) {
            const greener = (r, g) => g - r
            const redder = (r, g) => r - g
            const down = litMean(view, 0, 0, size, size / 4, greener) - litMean(view, 0, size * 3 / 4, size, size, greener)
            const across = litMean(view, size * 3 / 4, 0, size, size, redder) - litMean(view, 0, 0, size / 4, size, redder)
            assert.ok(litMean(authored, 0, 0, size, size / 4, greener) - litMean(authored, 0, size * 3 / 4, size, size, greener) > 128,
                'the uvMap reference must be greener at the top')
            assert.ok(down > 64, `${label}: particles at the top must carry the top of the input (green minus red, top minus bottom: ${down.toFixed(0)})`)
            assert.ok(across > 64, `${label}: particles at the right must carry the right of the input (red minus green, right minus left: ${across.toFixed(0)})`)
        },
    },
]

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
                await renderer.loadEffects(['synth/testPattern'])
            }, { baseUrl, backend, size })
            // Each case starts from a fresh pipeline, so particle state
            // never carries over from the previous case.
            async function frame(dsl, effects = [], frames = 2) {
                const name = await page.evaluate(async ({ dsl, effects, frames }) => {
                    await renderer.loadEffects(effects)
                    await renderer.dispose()
                    await renderer.compile(dsl)
                    renderer.stop()
                    for (let i = 0; i < frames; i++) renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    return renderer.pipeline.backend.getName().toLowerCase()
                }, { dsl, effects, frames })
                assert.equal(name, backend, 'requested backend must execute')
                return PNG.sync.read(await page.locator('canvas').screenshot())
            }
            const authored = await frame(`search synth\n${uvMap}.write(o0)\nrender(o0)`)
            for (const c of cases) {
                const label = `${backend} ${c.name}`
                try {
                    const view = await frame(c.dsl, c.effects, c.frames)
                    if (c.check) c.check(view, authored, label)
                    if (c.matchWebGL2 && backend === 'webgl2') webgl2Frames.set(c.name, view)
                    if (c.matchWebGL2 && backend === 'webgpu') {
                        const diff = meanAbsDiff(view, webgl2Frames.get(c.name))
                        assert.ok(diff <= 1, `${label}: WebGPU must match WebGL2 (mean difference ${diff.toFixed(2)})`)
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
assert.deepEqual(failures, [], `${failures.length} orientation case(s) failed`)
