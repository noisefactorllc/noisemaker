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
// surface(oN) on a mesh: seen from outside, the face shows the program upright
// and unmirrored. testPattern(pattern: uvMap) carries u in red and v in green,
// so on the presented 2D frame red rises to the right and green rises to the
// top, and the same must hold across the middle of every textured face.
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
const uvMap = 'testPattern(pattern: uvMap)'

// Mean of f(channel value) over a rectangle of the frame, rows top first.
function mean(png, x0, y0, x1, y1, channel, f = value => value) {
    let sum = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += f(png.data[(y * size + x) * 4 + channel])
    return sum / ((x1 - x0) * (y1 - y0))
}

// A scene presents through a Reinhard curve and a 2.2 gamma, which flatten
// bright values. This is the texture value an emitting face sampled, from the
// presented channel value.
const SAMPLED = Array.from({ length: 256 }, (_, value) => {
    const mapped = Math.min((value / 255) ** 2.2, 0.999)
    return mapped / (1 - mapped)
})
const sampled = value => SAMPLED[value]

// How far u (red) and v (green) rise to the right and to the top of a window.
// The window is given in frame fractions measured from the centre, +x right
// and +y up: [left, bottom, right, top].
function rises(png, [left, bottom, right, top], decode) {
    const px = f => Math.round((f + 1) / 2 * size)
    const [x0, x1, y0, y1] = [px(left), px(right), px(-top), px(-bottom)]
    const [mx, my] = [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)]
    const toRight = c => mean(png, mx, y0, x1, y1, c, decode) - mean(png, x0, y0, mx, y1, c, decode)
    const up = c => mean(png, x0, y0, x1, my, c, decode) - mean(png, x0, my, x1, y1, c, decode)
    return { uRight: toRight(0), uUp: up(0), vRight: toRight(1), vUp: up(1) }
}

// u must rise to the right only and v to the top only. A face that does not
// sample the program gives no rise, a mirrored face a negative one, and a
// turned face a rise along the other axis.
function assertAsAuthored(png, window, label, decode = sampled) {
    const r = rises(png, window, decode)
    const measured = `u rises ${r.uRight.toFixed(3)} to the right and ${r.uUp.toFixed(3)} to the top, ` +
        `v rises ${r.vUp.toFixed(3)} to the top and ${r.vRight.toFixed(3)} to the right`
    assert.ok(r.uRight > 0.03 && r.vUp > 0.03, `${label}: the face must show the program upright and unmirrored (${measured})`)
    assert.ok(Math.abs(r.uUp) < r.uRight / 4 && Math.abs(r.vRight) < r.vUp / 4,
        `${label}: the face must not show the program turned (${measured})`)
}

// Where the viewer stands. A face that lies flat is seen as the documented
// coordinate system has it seen: from the +Z side, by a camera raised to look
// down at it or lowered to look up at it. The face then does not fill the
// middle of the frame, so each of those cases names its own window.
const FRONT = '0, 0, 6'
const BACK = '0, 0, -6'
const RIGHT = '6, 0, 0'
const LEFT = '-6, 0, 0'
const RAISED = '0, 4, 4.5'
const LOWERED = '0, -4, 4.5'
const MIDDLE = [-0.4, -0.4, 0.4, 0.4]

const textured = (mesh, eye) => `search synth
${uvMap}.write(o1)
scene(
  background: [0, 0, 0], ambient: 0, ssao: 0, reflections: 0,
  camera(fov: 30, pos: [${eye}], target: [0, 0, 0]),
  ${mesh}.material(surface(o1).emit(strength: 1))
).write(o0)
render(o0)`

const face = (name, mesh, eye, window = MIDDLE) => ({
    name: `surface() on ${name}`,
    dsl: textured(mesh, eye),
    check(view, label) { assertAsAuthored(view, window, label) },
})

const box = 'mesh("box", size: [2, 2, 2])'
const sphere = 'mesh("sphere", radius: 1, segments: 48)'
const cylinder = 'mesh("cylinder", radius: 1, height: 2, segments: 48)'

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
    face('the +X face of a box', box, RIGHT),
    face('the -X face of a box', box, LEFT),
    face('the +Y face of a box', box, RAISED, [-0.3, 0.2, 0.3, 0.7]),
    face('the -Y face of a box', box, LOWERED, [-0.3, -0.7, 0.3, -0.2]),
    face('the +Z face of a box', box, FRONT),
    face('the -Z face of a box', box, BACK),
    face('a sphere seen from +Z', sphere, FRONT),
    face('a sphere seen from +X', sphere, RIGHT),
    face('a plane seen from above', 'mesh("plane", width: 2, height: 2)', RAISED, [-0.3, -0.3, 0.3, 0.25]),
    // Stood up to face the viewer, a plane is a screen for the program.
    face('a plane stood up to face +Z', 'mesh("plane", width: 2, height: 2, rot: [90, 0, 0])', FRONT),
    face('the side of a cylinder seen from +Z', cylinder, FRONT),
    face('the side of a cylinder seen from -Z', cylinder, BACK),
    face('the top cap of a cylinder', cylinder, RAISED, [-0.25, 0.28, 0.25, 0.64]),
    face('the bottom cap of a cylinder', cylinder, LOWERED, [-0.25, -0.64, 0.25, -0.28]),
    // A torus wraps the program around its tube, with the seam along its
    // outer edge. The window is the top of the tube on the part of the ring
    // nearest the viewer, above the seam.
    face('the top of a torus', 'mesh("torus", radius: 1, tube: 0.4, segments: 48, tubeSegments: 24)', RAISED,
        [-0.3, -0.55, 0.3, -0.25]),
    {
        name: 'reflectionProbe shows the floor in the lower half of a mirror sphere',
        dsl: mirror,
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
        // The frame of this scene settles over its first renders.
        frames: 12,
        matchWebGL2: true,
        // Ambient occlusion is on in this scene. One occlusion sample can fall
        // on either side of its threshold on the two backends, which moves a
        // few pixels by a few levels: test_visual_playwright.js measures it
        // and holds it under the ceiling used here. A probe that differs
        // moves many more pixels, by far more.
        ceiling: 6,
    },
]

// The largest difference between two frames, and the share of the frame that
// differs by more than rounding.
const ROUNDING = 2
function difference(a, b) {
    let max = 0
    let differing = 0
    for (let i = 0; i < a.data.length; i += 4) {
        let pixel = 0
        for (let c = 0; c < 3; c++) pixel = Math.max(pixel, Math.abs(a.data[i + c] - b.data[i + c]))
        if (pixel > ROUNDING) differing++
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
                await renderer.loadEffects(['synth/testPattern'])
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
            const authored = await frame(`search synth\n${uvMap}.write(o0)\nrender(o0)`)
            // The 2D frame presents the pattern's own values.
            assertAsAuthored(authored, MIDDLE, `${backend} the uvMap reference`, value => value / 255)
            for (const c of cases) {
                const label = `${backend} ${c.name}`
                try {
                    const view = await frame(c.dsl, c.frames, c.effects)
                    c.check?.(view, label)
                    if (c.matchWebGL2 && backend === 'webgl2') webgl2Frames.set(c.name, view)
                    if (c.matchWebGL2 && backend === 'webgpu') {
                        const { max, percent } = difference(view, webgl2Frames.get(c.name))
                        assert.ok(max <= (c.ceiling ?? ROUNDING) && percent <= 0.1,
                            `${label}: WebGPU must draw the frame WebGL2 draws (largest difference ${max}, ` +
                            `${percent.toFixed(2)}% of pixels differ by more than ${ROUNDING})`)
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
