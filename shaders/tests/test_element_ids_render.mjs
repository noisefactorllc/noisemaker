#!/usr/bin/env node
/**
 * Element ids have no effect on Noisemaker 1.x: a program with `_id:` on its
 * chain elements renders the same pixels as the same program without them,
 * frame by frame, a stateful program included, whose state 1.x keys by
 * position.
 *
 *   node shaders/tests/test_element_ids_render.mjs [--backend webgl2|webgpu]
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const backendArg = process.argv.indexOf('--backend')
const backends = backendArg >= 0 ? [process.argv[backendArg + 1]] : ['webgl2', 'webgpu']
const size = 64
const FRAMES = 30

const PROGRAMS = [
    {
        name: 'effects and writes',
        ids: 'search synth, filter\n\nnoise(_id: "pond", octaves: 3)\n  .invert(_id: "flip")\n  .write(o1, _id: "keep")\n\nread(_id: "again", surface: o1)\n  .write(o0, _id: "out")\n\nrender(o0)\n',
        bare: 'search synth, filter\n\nnoise(octaves: 3)\n  .invert()\n  .write(o1)\n\nread(o1)\n  .write(o0)\n\nrender(o0)\n',
    },
    {
        name: 'stateful particles',
        changes: true,
        ids: 'search points, synth, render\n\nperlin(_id: "field")\n  .pointsEmit(_id: "emit")\n  .physical(_id: "move")\n  .pointsRender(_id: "draw")\n  .write(o0, _id: "out")\n\nrender(o0)\n',
        bare: 'search points, synth, render\n\nperlin()\n  .pointsEmit()\n  .physical()\n  .pointsRender()\n  .write(o0)\n\nrender(o0)\n',
    },
]

const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

// Render the frames of one program on a fresh page and return each frame's pixels.
async function frames(backend, dsl) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (['error', 'warning'].includes(message.type())) errors.push(message.text())
    })
    try {
        await page.goto(`${baseUrl}/shaders/tests/blank.html`)
        await page.setContent(`<style>body{margin:0}canvas{display:block}</style><canvas width="${size}" height="${size}"></canvas>`)
        const name = await page.evaluate(async ({ baseUrl, backend, size, dsl }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: size, height: size,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            const manifest = await renderer.loadManifest()
            await renderer.loadEffects(Object.keys(manifest))
            await renderer.compile(dsl)
            renderer.stop()
            await renderer.pipeline.whenAsyncInitsSettled()
            return renderer.pipeline.backend.getName().toLowerCase()
        }, { baseUrl, backend, size, dsl })
        assert.equal(name, backend, 'the requested backend must execute')
        // Read each frame from the presented canvas, as the agreement harness does.
        const pixels = []
        for (let k = 0; k < FRAMES; k++) {
            await page.evaluate(async time => {
                await renderer.render(time)
                await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
            }, k / 600)
            pixels.push(PNG.sync.read(await page.locator('canvas').screenshot()).data)
        }
        assert.deepEqual(errors, [], `${backend} errors`)
        return pixels
    } finally {
        await page.close()
    }
}

try {
    for (const backend of backends) {
        for (const { name, ids, bare, changes } of PROGRAMS) {
            const withIds = await frames(backend, ids)
            const without = await frames(backend, bare)
            assert.equal(withIds.length, FRAMES)
            assert.ok(without.some(frame => frame.some((value, i) => i % 4 !== 3 && value !== 0)), `${name} (${backend}) renders something`)
            // A stateful program must change over its frames, or equal frames would show nothing.
            if (changes) assert.ok(!without[0].equals(without[FRAMES - 1]), `${name} (${backend}) changes over its frames`)
            for (let k = 0; k < FRAMES; k++) {
                assert.ok(withIds[k].equals(without[k]), `${name} (${backend}): frame ${k} differs with ids`)
            }
            console.log(`PASS ${name} (${backend}): ${FRAMES} frames are equal with and without ids`)
        }
    }
} finally {
    await browser.close()
    await releaseServer()
}
