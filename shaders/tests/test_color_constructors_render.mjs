import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const selected = process.argv.includes('--backend') ? process.argv[process.argv.indexOf('--backend') + 1] : null
if (selected) assert.ok(['webgl2', 'webgpu'].includes(selected))
const backends = selected ? [selected] : ['webgl2', 'webgpu']
const forms = [
    ['vec3(0.3, 0.2, 0.25)', '[0.3, 0.2, 0.25]'],
    ['vec4(0.3, 0.2, 0.25, 0.4)', '[0.3, 0.2, 0.25, 0.4]']
]

test('color constructors render the supplied components like array literals', { timeout: 120000 }, async t => {
    process.env.SHADE_PROJECT_ROOT = root
    process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
    const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
    const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
    let browser
    try {
        browser = await chromium.launch(shaderTestBrowserOptions())
        for (const backend of backends) for (const effect of ['solid', 'tint']) for (const [constructor, array] of forms) {
            await t.test(`${backend}: ${effect} color ${constructor}`, async () => {
                const page = await browser.newPage()
                const errors = []
                page.on('pageerror', error => errors.push(error.message))
                page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
                try {
                    await page.goto(`${baseUrl}/shaders/tests/blank.html`)
                    await page.setContent('<canvas width="8" height="8"></canvas>')
                    const frames = await page.evaluate(async ({ baseUrl, backend, effect, constructor, array }) => {
                        const { CanvasRenderer, compile } = await import(`${baseUrl}/shaders/src/index.js`)
                        const renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 8, height: 8,
                            basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                        try {
                            await renderer.loadManifest()
                            await renderer.loadEffects(['synth/solid', 'filter/tint'])
                            const frames = []
                            for (const color of [array, constructor]) {
                                const call = effect === 'solid' ? `solid(color: ${color})`
                                    : `solid(color: [0.2, 0.4, 0.6]).tint(color: ${color}, alpha: 1, mode: 0)`
                                const dsl = `search synth, filter\n${call}.write(o0)\nrender(o0)`
                                const diagnostics = compile(dsl).diagnostics
                                await renderer.compile(dsl)
                                renderer.stop()
                                await renderer.render(0)
                                await renderer.render(0)
                                const pipeline = renderer.pipeline
                                const target = pipeline.frameReadTextures?.get('o0') ?? pipeline.surfaces.get('o0').read
                                const pixels = await pipeline.backend.readPixels(target)
                                frames.push({ backend: pipeline.backend.getName().toLowerCase(), pixels: Array.from(pixels.data), diagnostics })
                            }
                            return frames
                        } finally {
                            await renderer.dispose()
                        }
                    }, { baseUrl, backend, effect, constructor, array })
                    for (const frame of frames) {
                        assert.equal(frame.backend, backend, 'the requested backend must execute')
                        assert.equal(frame.pixels.length, 8 * 8 * 4)
                    }
                    const expected = [76.5, 51, 63.75, 255]
                    for (let i = 0; i < frames[0].pixels.length; i++) {
                        assert.ok(Math.abs(frames[0].pixels[i] - expected[i % 4]) <= 1,
                            `array reference channel ${i}: ${frames[0].pixels[i]}, expected ${expected[i % 4]}`)
                    }
                    assert.deepEqual(frames[1].pixels, frames[0].pixels, 'constructor must render the array literal color')
                    for (const frame of frames) assert.deepEqual(frame.diagnostics, [])
                    assert.deepEqual(errors, [])
                } finally {
                    await page.close()
                }
            })
        }
    } finally {
        await browser?.close()
        await releaseServer()
    }
})
