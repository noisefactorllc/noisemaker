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
// Mean of f(red, green, blue) over the lit pixels in a band of the frame.
function litMean(png, x0, y0, x1, y1, f) {
    let sum = 0
    let lit = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const rgb = at(png, x, y)
        if (rgb[0] + rgb[1] + rgb[2] < 24) continue
        sum += f(rgb[0], rgb[1], rgb[2])
        lit++
    }
    assert.ok(lit > 16, `band ${x0},${y0}-${x1},${y1} must contain lit pixels`)
    return sum / lit
}

// The authored image with its pixels taken from (sx(x), sy(y)), rows top first.
function remapped(png, sx, sy) {
    const out = { data: new Uint8Array(png.data.length) }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const from = (sy(y) * size + sx(x)) * 4
        out.data.set(png.data.subarray(from, from + 4), (y * size + x) * 4)
    }
    return out
}
const keep = n => n
const reverse = n => size - 1 - n
const keepLow = n => (n < size / 2 ? n : size - 1 - n)
const keepHigh = n => (n >= size / 2 ? n : size - 1 - n)

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
    // glyphMap draws each glyph from its bitmap, whose row 0 is the top row.
    // With 32-pixel cells on the 128-pixel frame, each cell is one glyph:
    // decoding the 5x7 grid at the centre of each glyph pixel must read the
    // bitmap top row first. A dim grey input selects the period, which sits
    // on row 5, near the bottom of its cell. A light grey input selects '@'
    // or, for some cells, 'M'.
    ...[['period', '#181818', [['.....', '.....', '.....', '.....', '.....', '..#..', '.....']]],
        ['@ and M', '#e6e6e6', [['.###.', '#...#', '#.###', '#.#.#', '#.##.', '#....', '.###.'],
            ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '.....']]]].map(([glyph, color, bitmaps]) => ({
        name: `filter/glyphMap draws the ${glyph} glyph upright`,
        effects: ['filter/glyphMap', 'synth/solid'],
        dsl: `search filter, synth
solid(color: ${color}).glyphMap(cellSize: 32, colorMode: mono).write(o0)
render(o0)`,
        check(view, authored, label) {
            for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
                const rows = Array.from({ length: 7 }, (_, r) => Array.from({ length: 5 }, (_, c) =>
                    at(view, Math.floor(cx * 32 + (c + 0.5) * 32 / 5), Math.floor(cy * 32 + (r + 0.5) * 32 / 7))[0] > 128 ? '#' : '.').join(''))
                assert.ok(bitmaps.some(bitmap => bitmap.every((row, r) => row === rows[r])),
                    `${label}: cell ${cx},${cy} must read the bitmap top row first (read ${rows.join(' ')})`)
            }
        },
    })),
    // Flip and mirror modes do only what their names say. A mirror mode keeps
    // the named half as authored and reflects it onto the other half:
    // "up to down" keeps the top half, "left to right" the left half. The
    // presented rows run top first, so the top half is rows 0-63. synth/media
    // takes a canvas copy of the uvMap; flipMirror takes the uvMap itself.
    ...[
        ['none', keep, keep], ['all', reverse, reverse], ['horizontal', reverse, keep], ['vertical', keep, reverse],
        ['mirrorLtoR', keepLow, keep], ['mirrorRtoL', keepHigh, keep], ['mirrorUtoD', keep, keepLow],
        ['mirrorDtoU', keep, keepHigh], ['mirrorLtoRUtoD', keepLow, keepLow], ['mirrorLtoRDtoU', keepLow, keepHigh],
        ['mirrorRtoLUtoD', keepHigh, keepLow], ['mirrorRtoLDtoU', keepHigh, keepHigh],
    ].flatMap(([mode, sx, sy]) => [
        ['synth/media', `search synth\nmedia(imageSize: [${size}, ${size}], flip: ${mode})`],
        ['filter/flipMirror', `search filter, synth\n${uvMap}.flipMirror(mode: ${mode})`],
    ].map(([effect, chain]) => ({
        name: `${effect} ${mode} keeps the named half`,
        effects: [effect],
        dsl: `${chain}.write(o0)\nrender(o0)`,
        check(view, authored, label) {
            const diff = meanAbsDiff(view, remapped(authored, sx, sy))
            assert.ok(diff <= 2, `${label}: the frame must be the authored image under the named flip (mean difference ${diff.toFixed(2)})`)
        },
    }))),
    // The volume renderers show a volume as authored. heightmap3d builds a
    // full cube from a media image whose red is 255 everywhere (so render3d,
    // which reads density from red, sees a solid cube), whose green is 255 on
    // the image's right half and whose blue is 255 on its top half. Image
    // right is +X and the image's top row is the far side, -Z. Seen from the
    // front, the camera's default, the cube's right side is the green half;
    // seen from directly above, the image reads as authored.
    ...[['render/render3d', 'render3d()', 'from the front'],
        ['render/renderLit3d', 'renderLit3d()', 'from the front'],
        ['render/renderLit3d', 'renderLit3d(cameraPosition: [0, 1, 0])', 'from directly above']].map(([effect, call, view]) => ({
        name: `${effect} shows the volume as authored ${view}`,
        effects: [effect, 'synth3d/heightmap3d', 'synth/solid', 'synth/media'],
        media: 'cube',
        matchWebGL2: true,
        dsl: `search synth3d, render, synth
heightmap3d(heightTex: solid(color: #ffffff), tex: media(imageSize: [${size}, ${size}]), volumeSize: x64, heightScale: 1)
  .${call}.write(o0)
render(o0)`,
        check(rendered, authored, label) {
            const greener = (r, g) => g - r
            const across = litMean(rendered, size * 5 / 8, 0, size, size, greener) - litMean(rendered, 0, 0, size * 3 / 8, size, greener)
            assert.ok(across > 32, `${label}: image right must be screen right (green minus red, right minus left: ${across.toFixed(0)})`)
            if (view === 'from directly above') {
                const bluer = (r, g, b) => b - r
                const down = litMean(rendered, 0, 0, size, size * 3 / 8, bluer) - litMean(rendered, 0, size * 5 / 8, size, size, bluer)
                assert.ok(down > 32, `${label}: image top must be screen top (blue minus red, top minus bottom: ${down.toFixed(0)})`)
            }
        },
    })),
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
                // Images for synth/media, uploaded as hosts upload media: top row
                // first, without flipping. 'uv' is a canvas copy of the uvMap;
                // 'cube' is red everywhere, green on its right half and blue on
                // its top half.
                const canvasOf = pixel => {
                    const canvas = document.createElement('canvas')
                    canvas.width = size
                    canvas.height = size
                    const image = new ImageData(size, size)
                    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) image.data.set(pixel(x, y), (y * size + x) * 4)
                    canvas.getContext('2d').putImageData(image, 0, 0)
                    return canvas
                }
                window.mediaCanvases = {
                    uv: canvasOf((x, y) => [Math.round(255 * (x + 0.5) / size), Math.round(255 * (1 - (y + 0.5) / size)), 0, 255]),
                    cube: canvasOf((x, y) => [255, x < size / 2 ? 0 : 255, y < size / 2 ? 255 : 0, 255]),
                }
            }, { baseUrl, backend, size })
            // Each case starts from a fresh pipeline, so particle state
            // never carries over from the previous case.
            async function frame(dsl, effects = [], frames = 2, media = 'uv') {
                const name = await page.evaluate(async ({ dsl, effects, frames, media }) => {
                    await renderer.loadEffects(effects)
                    await renderer.dispose()
                    await renderer.compile(dsl)
                    renderer.stop()
                    renderer.render(0)
                    for (const pass of renderer.pipeline.graph.passes.filter(p => p.effectFunc === 'media')) {
                        renderer.updateTextureFromSource('imageTex_step_' + pass.stepIndex, window.mediaCanvases[media], { flipY: false })
                    }
                    for (let i = 0; i < frames; i++) renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    return renderer.pipeline.backend.getName().toLowerCase()
                }, { dsl, effects, frames, media })
                assert.equal(name, backend, 'requested backend must execute')
                return PNG.sync.read(await page.locator('canvas').screenshot())
            }
            const authored = await frame(`search synth\n${uvMap}.write(o0)\nrender(o0)`)
            for (const c of cases) {
                const label = `${backend} ${c.name}`
                try {
                    const view = await frame(c.dsl, c.effects, c.frames, c.media)
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
