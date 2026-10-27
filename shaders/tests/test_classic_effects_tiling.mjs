#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// Every reachable classicNoisedeck/effects variant must be tile-aware: a
// large-format export, which renders the frame as tiles with a tileOffset,
// the fullResolution and a renderScale, must reproduce the untiled frame.
// Each case renders a 128x128 frame untiled, then as a 4x4 grid of 32x32
// tiles through the same setTileRegion() call the host's export uses, on
// both backends. Each tile renders on a 64x64 canvas that extends 16 px
// past its region on every side (the host's planner does the same: see
// calculateTileGrid, "may extend past image bounds"), so the variants'
// bounded cross-tile reads (convolution neighborhoods, block grids, bloom
// taps, zoom-blur taps at these amounts) resolve real texels at tile joins.
// All canvas sizes are powers of two, so every mapped sample coordinate is
// computed bit-exactly and the stitched tiles must equal the untiled frame
// byte for byte.
//
// The comparison excludes a 16 px band at the frame's outer edges. There the
// untiled frame clamps its input at the image border while a tile reads the
// real content the host's padded tile canvas holds outside the image, so a
// print may legitimately differ from the screen within reach of its border.
// All tile joins sit inside the compared region. The case DSLs use the
// identity transform chain: rotation, scale, offset and flip resample the
// input across the whole frame, which no per-tile input can supply, so
// noisedeck routes transformed DSLs of this effect to its upscale-only
// deny-list (the same determinant as spinBlur and flipMirror); what this
// test verifies is the shader-level tile mapping every variant shares.
// cga and subpixel additionally render tiled at renderScale 3, where the
// GLSL and WGSL must still agree byte for byte, and zoomBlur renders with a
// 4096 px fullResolution to exercise the tap clamp both backends must
// apply alike.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const full = 128
const margin = 16
const region = 32
const tile = region + 2 * margin
const band = 16
const effects = ['classicNoisedeck/noise', 'classicNoisedeck/effects']
const cases = [
    { mode: 'blur', amount: 5 }, { mode: 'derivDivide', amount: 5 },
    { mode: 'edge', amount: 5 }, { mode: 'emboss', amount: 5 },
    { mode: 'outline', amount: 5 }, { mode: 'shadow', amount: 5 },
    { mode: 'sharpen', amount: 5 }, { mode: 'sobel', amount: 5 },
    { mode: 'litEdge', amount: 5 }, { mode: 'derivatives', amount: 5 },
    { mode: 'blurSharpen', amount: 5 }, { mode: 'smoothEdge', amount: 5 },
    { mode: 'pixels', amount: 3 }, { mode: 'posterize', amount: 10 },
    { mode: 'cga', amount: 3 }, { mode: 'subpixel', amount: 5 },
    { mode: 'bloom', amount: 5 }, { mode: 'zoomBlur', amount: 4 },
]
const renderScaleCases = ['cga', 'subpixel']
const dslFor = (mode, amount) =>
    `search classicNoisedeck\n\nnoise(seed: 1).effects(effect: ${mode}, effectAmt: ${amount}).write(o0)\nrender(o0)`

function differences(a, b) {
    assert.equal(a.length, b.length, 'frame sizes must match')
    let count = 0
    let max = 0
    for (let i = 0; i < a.length; i++) {
        const diff = Math.abs(a[i] - b[i])
        if (diff) count++
        max = Math.max(max, diff)
    }
    return { count, max }
}

function flipRows(data, width, height) {
    const out = new Array(data.length)
    for (let row = 0; row < height; row++) {
        const src = (row * width) * 4
        const dst = ((height - 1 - row) * width) * 4
        for (let i = 0; i < width * 4; i++) out[dst + i] = data[src + i]
    }
    return out
}

const failures = []
const scaleStitched = { webgl2: {}, webgpu: {} }
const clampedTiles = { webgl2: null, webgpu: null }
// Readback orientation, detected per backend: true when readback row 0 holds
// the image top, false when it holds the image bottom.
const readbackTopByBackend = {}
try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: tile, height: tile } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => {
            if (isReadbackPerformanceWarning(message.type(), message.text())) return
            if (['error', 'warning'].includes(message.type())) errors.push(message.text())
        })
        try {
            await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
            await page.setContent('<link rel="icon" href="data:,">')
            await page.evaluate(async ({ baseUrl, backend, effects, full, region, margin, tile }) => {
                const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
                const make = async size => {
                    const canvas = document.createElement('canvas')
                    canvas.width = size
                    canvas.height = size
                    document.body.appendChild(canvas)
                    const renderer = new CanvasRenderer({ canvas, width: size, height: size,
                        basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                    await renderer.loadManifest()
                    await renderer.loadEffects(effects)
                    return renderer
                }
                const read = async renderer => {
                    renderer.render(0)
                    renderer.render(0)
                    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone?.()
                    const pixels = await renderer.pipeline.backend.readPixels(renderer.pipeline.surfaces.get('o0').read)
                    return { width: pixels.width, height: pixels.height, data: Array.from(pixels.data),
                        backend: renderer.pipeline.backend.getName().toLowerCase() }
                }
                window.untiled = await make(full)
                window.tiled = await make(tile)
                // The tile canvas extends margin px past its region on every
                // side; the host passes bottom-origin offsets.
                const regionOffsets = []
                for (let y = 0; y < full; y += region) for (let x = 0; x < full; x += region) {
                    regionOffsets.push([x, y])
                }
                window.renderCase = async (dsl, renderScale, fullRes) => {
                    await untiled.compile(dsl)
                    untiled.stop()
                    const reference = fullRes ? null : await read(untiled)
                    await tiled.compile(dsl)
                    tiled.stop()
                    const tiles = []
                    for (const regionOffset of regionOffsets) {
                        tiled.setTileRegion({
                            offset: [regionOffset[0] - margin, regionOffset[1] - margin],
                            fullResolution: fullRes || [full, full],
                            renderScale,
                        })
                        tiles.push({ regionOffset, ...await read(tiled) })
                    }
                    tiled.clearTileRegion()
                    return { reference, tiles }
                }
                // One tile whose canvas extends 16 px past the frame's
                // bottom-left corner, plus the untiled reference.
                window.orientationProbe = async dsl => {
                    await untiled.compile(dsl)
                    untiled.stop()
                    const ref = await read(untiled)
                    await tiled.compile(dsl)
                    tiled.stop()
                    tiled.setTileRegion({ offset: [-16, -16], fullResolution: [full, full], renderScale: 1 })
                    const t = await read(tiled)
                    tiled.clearTileRegion()
                    return { ref, t }
                }
            }, { baseUrl, backend, effects, full, region, margin, tile })

            // Detect this backend's readback orientation. Render the noise
            // source untiled, then one tile whose canvas extends 16 px past
            // the frame's bottom-left corner. The tile's canvas rows/cols
            // [16, 48) hold global bottom-origin [0, 32) with no sampling, so
            // exactly one of the two candidate placements matches the
            // untiled frame's bottom-left 32x32 bit for bit.
            const noiseDsl = 'search classicNoisedeck\n\nnoise(seed: 1).write(o0)\nrender(o0)'
            {
                const probe = await page.evaluate(dsl => window.orientationProbe(dsl), noiseDsl)
                let matched = null
                for (const cand of ['top', 'bottom']) {
                    let diff = 0
                    for (let gy = 0; gy < 32 && !diff; gy++) for (let gx = 0; gx < 32 && !diff; gx++) {
                        // Tile canvas bottom-origin row/col for global (gx, gy).
                        const c = 16 + gy, k = 16 + gx
                        const r = cand === 'top' ? tile - 1 - c : c
                        // Reference global bottom-origin (gx, gy) in its own
                        // readback order.
                        const rr = cand === 'top' ? full - 1 - gy : gy
                        const ti = (r * tile + k) * 4
                        const ri = (rr * full + gx) * 4
                        for (let ch = 0; ch < 3; ch++) diff += Math.abs(probe.t.data[ti + ch] - probe.ref.data[ri + ch])
                    }
                    if (diff === 0) matched = cand
                }
                assert.ok(matched, `${backend}: readback orientation probe must match exactly one candidate`)
                readbackTopByBackend[backend] = matched === 'top'
            }
            const readbackTop = readbackTopByBackend[backend]

            const stitch = tiles => {
                const stitched = new Array(full * full * 4).fill(0)
                for (const t of tiles) {
                    for (let c = margin; c < margin + region; c++) {
                        // c is the tile canvas row in bottom-origin pixels.
                        const r = readbackTop ? tile - 1 - c : c
                        const globalBottomRow = t.regionOffset[1] + (c - margin)
                        const destRow = readbackTop ? full - 1 - globalBottomRow : globalBottomRow
                        for (let k = margin; k < margin + region; k++) {
                            const destCol = t.regionOffset[0] + (k - margin)
                            const src = (r * tile + k) * 4
                            const dst = (destRow * full + destCol) * 4
                            stitched[dst] = t.data[src]
                            stitched[dst + 1] = t.data[src + 1]
                            stitched[dst + 2] = t.data[src + 2]
                            stitched[dst + 3] = t.data[src + 3]
                        }
                    }
                }
                return stitched
            }

            for (const c of cases) {
                const label = `${backend} effects(${c.mode}, ${c.amount})`
                try {
                    const { reference, tiles } = await page.evaluate(dsl => window.renderCase(dsl, 1), dslFor(c.mode, c.amount))
                    assert.equal(reference.backend, backend, 'requested backend must execute')
                    assert.ok(reference.data.some((v, i) => i % 4 !== 3 && v > 0), `${label}: the untiled frame must not be empty`)
                    const stitched = stitch(tiles)
                    // Compare only the deep interior: the outer band is where
                    // the untiled frame clamps its input at the image border.
                    const refInterior = []
                    const stitchedInterior = []
                    for (let row = band; row < full - band; row++) {
                        for (let i = (row * full + band) * 4; i < (row * full + full - band) * 4; i++) {
                            refInterior.push(reference.data[i])
                            stitchedInterior.push(stitched[i])
                        }
                    }
                    const d = differences(stitchedInterior, refInterior)
                    assert.ok(d.count === 0, `${label}: the stitched tiles must equal the untiled frame inside the interior region (${d.count} values differ, max ${d.max})`)
                    console.log(`PASS ${label}`)
                } catch (error) {
                    failures.push(error.message)
                    console.log(`FAIL ${error.message}`)
                }
            }

            // renderScale leg: cga and subpixel scale their density by
            // renderScale, so the two backends must still agree byte for byte
            // when a tile sets renderScale 3. Cross-backend comparison happens
            // after both backends have run.
            for (const mode of renderScaleCases) {
                const label = `${backend} effects(${mode}) at renderScale 3`
                try {
                    const { tiles } = await page.evaluate(dsl => window.renderCase(dsl, 3), dslFor(mode, 3))
                    scaleStitched[backend][mode] = stitch(tiles)
                    console.log(`PASS ${label} (captured)`)
                } catch (error) {
                    failures.push(error.message)
                    console.log(`FAIL ${error.message}`)
                }
            }

            // Tap-clamp leg: zoomBlur's displacement is a fraction of
            // fullResolution, so with a 4096 px full resolution every tap
            // exceeds the 256 px budget and the clamp must engage. Both
            // backends must produce identical tiles.
            {
                const label = `${backend} effects(zoomBlur) clamped at fullResolution 4096`
                try {
                    clampedTiles[backend] = (await page.evaluate(dsl =>
                        window.renderCase(dsl, 1, [4096, 4096]), dslFor('zoomBlur', 4))).tiles
                    console.log(`PASS ${label} (captured)`)
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
    // Cross-backend comparison of the renderScale-3 tiled renders. Each
    // backend's stitched array is in its own readback row order, so
    // normalize both to top-first before comparing.
    for (const mode of renderScaleCases) {
        const label = `renderScale 3 effects(${mode}): webgpu must equal webgl2`
        try {
            const webgl = readbackTopByBackend.webgl2 ? scaleStitched.webgl2[mode] : flipRows(scaleStitched.webgl2[mode], full, full)
            const webgpu = readbackTopByBackend.webgpu ? scaleStitched.webgpu[mode] : flipRows(scaleStitched.webgpu[mode], full, full)
            const d = differences(webgpu, webgl)
            assert.ok(d.count === 0, `${label} (${d.count} values differ, max ${d.max})`)
            console.log(`PASS ${label}`)
        } catch (error) {
            failures.push(error.message)
            console.log(`FAIL ${error.message}`)
        }
    }
    // Cross-backend comparison of the clamped zoomBlur tiles: each tile's
    // 32x32 region (canvas rows/cols [margin, margin+region)) must match.
    {
        const label = 'clamped zoomBlur: webgpu must equal webgl2'
        try {
            const webgl = clampedTiles.webgl2
            const webgpu = clampedTiles.webgpu
            assert.ok(webgl && webgpu, 'both backends must have captured clamped tiles')
            for (let i = 0; i < webgl.length; i++) {
                const gl = webgl[i], gpu = webgpu[i]
                // Crop each backend's tile in its own readback row order:
                // canvas bottom-origin rows [margin, margin+region).
                const glCrop = []
                const gpuCrop = []
                for (let c = margin; c < margin + region; c++) {
                    const glR = readbackTopByBackend.webgl2 ? tile - 1 - c : c
                    const gpuR = readbackTopByBackend.webgpu ? tile - 1 - c : c
                    for (let k = margin; k < margin + region; k++) {
                        for (let ch = 0; ch < 4; ch++) {
                            glCrop.push(gl.data[(glR * tile + k) * 4 + ch])
                            gpuCrop.push(gpu.data[(gpuR * tile + k) * 4 + ch])
                        }
                    }
                }
                const d = differences(gpuCrop, glCrop)
                assert.ok(d.count === 0, `${label}: tile ${i} (${d.count} values differ, max ${d.max})`)
            }
            console.log(`PASS ${label}`)
        } catch (error) {
            failures.push(error.message)
            console.log(`FAIL ${error.message}`)
        }
    }
} finally {
    await browser.close()
    await releaseServer()
}
assert.deepEqual(failures, [], `${failures.length} tiling case(s) failed`)
