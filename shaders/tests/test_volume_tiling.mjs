#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// A volume generator builds the same volume whatever the screen tile, so a
// large-format export, which renders the frame as tiles with a tileOffset,
// the fullResolution and a renderScale, equals the untiled frame. Each case
// renders a 64x64 frame untiled, then as 2x2 tiles of 32x32 through the
// same setTileRegion() call the host's export uses, on both backends. Every
// tile's volume atlas must equal the untiled atlas, and the stitched tiles
// must equal the untiled frame, byte for byte.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const full = 64
const tile = 32
const generators = ['fractal3d', 'noise3d', 'cell3d', 'flythrough3d', 'shape3d']
const effects = [...generators.map(name => `synth3d/${name}`), 'render/renderLit3d']

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

const failures = []
try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: full, height: full } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => {
            if (isReadbackPerformanceWarning(message.type(), message.text())) return
            if (['error', 'warning'].includes(message.type())) errors.push(message.text())
        })
        try {
            await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
            await page.setContent('<link rel="icon" href="data:,">')
            await page.evaluate(async ({ baseUrl, backend, effects }) => {
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
                const read = async (renderer, id) => {
                    const pixels = await renderer.pipeline.backend.readPixels(id)
                    return { width: pixels.width, height: pixels.height, data: Array.from(pixels.data) }
                }
                // The frame and the generator's volume atlas outputs.
                const capture = async (renderer, generator) => {
                    renderer.render(0)
                    renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    const pass = renderer.pipeline.graph.passes.find(p => p.effectFunc === generator)
                    const volumes = {}
                    for (const [name, id] of Object.entries(pass.outputs)) volumes[name] = await read(renderer, id)
                    return { frame: await read(renderer, renderer.pipeline.surfaces.get('o0').read), volumes,
                        backend: renderer.pipeline.backend.getName().toLowerCase() }
                }
                window.untiled = await make(64)
                window.tiled = await make(32)
                window.renderCase = async (dsl, generator, renderScale) => {
                    await untiled.compile(dsl)
                    untiled.stop()
                    const reference = await capture(untiled, generator)
                    await tiled.compile(dsl)
                    tiled.stop()
                    const tiles = []
                    for (const offset of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
                        tiled.setTileRegion({ offset, fullResolution: [64, 64], renderScale })
                        tiles.push({ offset, ...await capture(tiled, generator) })
                    }
                    tiled.clearTileRegion()
                    return { reference, tiles }
                }
            }, { baseUrl, backend, effects })

            for (const generator of generators) for (const renderScale of [1, 2]) {
                const label = `${backend} synth3d/${generator} at renderScale ${renderScale}`
                const dsl = `search synth3d, render\n${generator}(volumeSize: x32).renderLit3d().write(o0)\nrender(o0)`
                const { reference, tiles } = await page.evaluate(({ dsl, generator, renderScale }) =>
                    window.renderCase(dsl, generator, renderScale), { dsl, generator, renderScale })
                try {
                    assert.equal(reference.backend, backend, 'requested backend must execute')
                    assert.ok(reference.frame.data.some((v, i) => i % 4 !== 3 && v > 0), `${label}: the untiled frame must not be empty`)
                    // WebGL2 readback rows run top first and WebGPU readback
                    // rows bottom first; the stitched frame keeps that order.
                    const topFirst = backend === 'webgl2'
                    const stitched = new Array(full * full * 4).fill(0)
                    for (const t of tiles) {
                        assert.equal(t.backend, backend, 'requested backend must execute')
                        for (const [name, volume] of Object.entries(t.volumes)) {
                            const d = differences(volume.data, reference.volumes[name].data)
                            assert.ok(d.count === 0, `${label}: tile ${t.offset} volume ${name} must equal the untiled volume (${d.count} values differ, max ${d.max})`)
                        }
                        for (let row = 0; row < tile; row++) {
                            const fullRow = topFirst ? full - t.offset[1] - tile + row : t.offset[1] + row
                            for (let i = 0; i < tile * 4; i++) stitched[(fullRow * full + t.offset[0]) * 4 + i] = t.frame.data[row * tile * 4 + i]
                        }
                    }
                    const d = differences(stitched, reference.frame.data)
                    assert.ok(d.count === 0, `${label}: the stitched tiles must equal the untiled frame (${d.count} values differ, max ${d.max})`)
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
assert.deepEqual(failures, [], `${failures.length} tiling case(s) failed`)
