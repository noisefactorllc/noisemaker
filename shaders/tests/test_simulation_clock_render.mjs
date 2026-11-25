#!/usr/bin/env node
/**
 * The fixed-step simulation clock in a real browser. Each simulation starts
 * from resetSimulation(0) and renders one second of a 10-second loop at 60,
 * 30 and 24 renders a second, as a preview and an export call render(t). The
 * frames at the loop times all three share (every 1/6 s) are byte-identical:
 * run to run at 60, and between the frame rates.
 *
 *   node shaders/tests/test_simulation_clock_render.mjs [--backend webgl2|webgpu]
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const backendArg = process.argv.indexOf('--backend')
const backends = backendArg >= 0 ? [process.argv[backendArg + 1]] : ['webgl2', 'webgpu']
// Large enough that roll's scroll moves at least a pixel a step.
const size = 256

const PROGRAMS = [
    { name: 'cellularAutomata', dsl: 'search synth\n\ncellularAutomata()\n  .write(o0)\n\nrender(o0)\n' },
    { name: 'mnca', dsl: 'search synth\n\nmnca()\n  .write(o0)\n\nrender(o0)\n' },
    { name: 'roll', dsl: 'search synth\n\nroll(speed: 5)\n  .write(o0)\n\nrender(o0)\n' },
    { name: 'particles', dsl: 'search points, synth, render\n\nperlin()\n  .pointsEmit()\n  .physical()\n  .pointsRender()\n  .write(o0)\n\nrender(o0)\n' },
    { name: 'feedback', dsl: 'search synth, filter\n\nnoise(speed: 1)\n  .feedback()\n  .write(o0)\n\nrender(o0)\n' },
]

const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

// One second of loop at `fps` renders a second. Returns the sha256 of the
// render surface's pixels at each loop time that is a multiple of 1/6 s.
async function run(page, dsl, fps) {
    return page.evaluate(async ({ dsl, fps }) => {
        const r = window.renderer
        await r.compile(dsl)
        r.stop()
        await r.pipeline.whenAsyncInitsSettled()
        if (!r.pipeline.hasSimulation) throw new Error('The program has no simulation state')
        r.pipeline.resetSimulation(0)
        const samples = {}
        for (let k = 0; k <= fps; k++) {
            await r.render(k / (fps * 10))
            if ((k * 6) % fps !== 0) continue
            await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
            const surface = r.pipeline.surfaces.get('o0')
            const pixels = await r.pipeline.backend.readPixels(surface.read)
            const digest = await crypto.subtle.digest('SHA-256', pixels.data)
            samples[(k * 6) / fps] = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
        }
        return samples
    }, { dsl, fps })
}

try {
    for (const backend of backends) {
        const page = await browser.newPage({ viewport: { width: size, height: size } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => {
            if (isReadbackPerformanceWarning(message.type(), message.text())) return
            if (['error', 'warning'].includes(message.type())) errors.push(message.text())
        })
        try {
            await page.goto(`${baseUrl}/shaders/tests/blank.html`)
            await page.setContent(`<style>body{margin:0}canvas{display:block}</style><canvas width="${size}" height="${size}"></canvas>`)
            const actual = await page.evaluate(async ({ baseUrl, backend, size }) => {
                const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
                window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: size, height: size,
                    basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                const manifest = await renderer.loadManifest()
                await renderer.loadEffects(Object.keys(manifest))
                // Held notes, so roll draws and scrolls them.
                const midi = renderer.setMidiState()
                midi.channels[1].noteOn(48, 110, { time: 0, order: 1 })
                midi.channels[3].noteOn(67, 75, { time: 0, order: 2 })
                await renderer.compile('search synth\n\nnoise()\n  .write(o0)\n\nrender(o0)\n')
                return renderer.pipeline.backend.getName().toLowerCase()
            }, { baseUrl, backend, size })
            assert.equal(actual, backend, 'the requested backend must execute')
            for (const { name, dsl } of PROGRAMS) {
                const at60 = await run(page, dsl, 60)
                const again = await run(page, dsl, 60)
                const at30 = await run(page, dsl, 30)
                const at24 = await run(page, dsl, 24)
                assert.deepEqual(Object.keys(at60).length, 7)
                assert.deepEqual(again, at60, `${name} (${backend}): two runs differ`)
                assert.deepEqual(at30, at60, `${name} (${backend}): 30 renders a second differ from 60`)
                assert.deepEqual(at24, at60, `${name} (${backend}): 24 renders a second differ from 60`)
                // A simulation that changes over the second, so equal frames mean something.
                const distinct = new Set(Object.values(at60)).size
                assert.ok(distinct > 1, `${name} (${backend}) does not change over its frames`)
                console.log(`PASS ${name} (${backend}): 7 sampled frames equal run to run and at 60, 30 and 24 renders a second (${distinct} distinct)`)
            }
            assert.deepEqual(errors, [], `${backend} errors`)
        } finally {
            await page.close()
        }
    }
} finally {
    await browser.close()
    await releaseServer()
}
