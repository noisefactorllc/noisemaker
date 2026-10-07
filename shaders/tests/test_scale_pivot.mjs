#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// scale() maps each output coordinate p to the input at (p - c) / s + c, so the
// point c = (centerX, centerY) stays fixed on both axes. A uvMap input makes the
// expected output analytic: red is u and green is v at every pixel.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const backendArg = process.argv.indexOf('--backend')
const backends = backendArg >= 0 ? [process.argv[backendArg + 1]] : ['webgl2', 'webgpu']
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
// A non-square frame checks that aspect correction cancels on the x axis.
const width = 160, height = 96
const tolerance = 3
const cases = [
    { x: 2, y: 2, centerX: 0.25, centerY: 0.75 },
    { x: 0.5, y: 0.5, centerX: 0.7, centerY: 0.3 },
    { x: 3, y: 1, centerX: 0.5, centerY: 0.5 },
]

const clamp01 = value => Math.min(Math.max(value, 0), 1)

try {
    for (const backend of backends) {
        const page = await browser.newPage({ viewport: { width, height } })
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
                await renderer.loadEffects(['synth/testPattern', 'filter/scale'])
            }, { baseUrl, backend, width, height })
            async function frame(dsl) {
                const name = await page.evaluate(async dsl => {
                    await renderer.compile(dsl)
                    renderer.stop()
                    renderer.render(0)
                    renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    return renderer.pipeline.backend.getName().toLowerCase()
                }, dsl)
                assert.equal(name, backend, 'requested backend must execute')
                return PNG.sync.read(await page.locator('canvas').screenshot()).data
            }
            const input = await frame('search synth\ntestPattern(pattern: uvMap).write(o0)\nrender(o0)')
            for (const c of cases) {
                const args = `x: ${c.x}, y: ${c.y}, centerX: ${c.centerX}, centerY: ${c.centerY}, wrap: clamp`
                const output = await frame(`search synth, filter\ntestPattern(pattern: uvMap).scale(${args}).write(o0)\nrender(o0)`)
                let worst = { error: 0 }
                for (let i = 0; i < input.length; i += 4) {
                    const u = input[i] / 255, v = input[i + 1] / 255
                    const expected = [clamp01((u - c.centerX) / c.x + c.centerX), clamp01((v - c.centerY) / c.y + c.centerY)]
                    for (const channel of [0, 1]) {
                        const error = Math.abs(output[i + channel] - expected[channel] * 255)
                        if (error > worst.error) worst = { error, channel, x: (i / 4) % width, y: Math.floor(i / 4 / width) }
                    }
                }
                assert.ok(worst.error <= tolerance,
                    `${backend} scale(${args}): ${worst.channel === 0 ? 'red (u)' : 'green (v)'} off by ${worst.error.toFixed(1)} at ${worst.x},${worst.y}; the pivot must stay at (centerX, centerY)`)
            }
            assert.deepEqual(errors, [], `${backend} console must be clean`)
            console.log(`PASS scale() holds (centerX, centerY) fixed on both axes (${backend})`)
        } finally {
            await page.close()
        }
    }
} finally {
    await browser.close()
    await releaseServer()
}
