import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
let browser
try {
    browser = await chromium.launch(shaderTestBrowserOptions())
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(baseUrl)
    await page.setContent('<canvas width="8" height="8"></canvas>')
    const frames = await page.evaluate(async baseUrl => {
        const { Pipeline } = await import(`${baseUrl}/shaders/src/runtime/pipeline.js`)
        const { WebGL2Backend } = await import(`${baseUrl}/shaders/src/runtime/backends/webgl2.js`)
        const update = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.2, 0.6, 0.8, 1.0); }`
        const show = `#version 300 es
precision highp float;
uniform sampler2D source;
out vec4 fragColor;
void main() { fragColor = texture(source, vec2(0.5)); }`

        async function render(persistent) {
            const canvas = document.createElement('canvas')
            canvas.width = 8
            canvas.height = 8
            const gl = canvas.getContext('webgl2')
            if (!gl) throw new Error('WebGL2 is required')
            const backend = new WebGL2Backend(gl, canvas)
            const graph = {
                passes: [
                    { id: 'update_memory', program: 'update', inputs: {},
                      outputs: { color: 'global_memory' },
                      conditions: { runIf: [{ uniform: 'frame', equals: 0 }] } },
                    { id: 'show_memory', program: 'show',
                      inputs: { source: 'global_memory' }, outputs: { color: 'result' } }
                ],
                textures: new Map([
                    ['global_memory', { width: 'screen', height: 'screen', format: 'rgba8', persistent }],
                    ['result', { width: 'screen', height: 'screen', format: 'rgba8', usage: ['render', 'sample'] }]
                ]),
                programs: { update: { source: update }, show: { source: show } }
            }
            const pipeline = new Pipeline(graph, backend)
            const pixels = []
            const counts = []
            try {
                await pipeline.init(8, 8)
                for (const time of [0, 0.016, 0.032, 0.048]) {
                    pipeline.render(time)
                    counts.push(pipeline.lastPassCount)
                    pixels.push(Array.from(backend.readPixels('result').data.slice(0, 4)))
                }
            } finally {
                pipeline.dispose()
            }
            return {pixels,counts}
        }
        return { persistent: await render(true), ordinary: await render(false) }
    }, baseUrl)

    const expected = [51, 153, 204, 255]
    assert.deepEqual(frames.persistent.counts, [2, 1, 1, 1], 'producer must be skipped after frame zero')
    assert.deepEqual(frames.ordinary.counts, [2, 1, 1, 1], 'control must skip the same producer frames')
    for (const [index, pixel] of frames.persistent.pixels.entries()) {
        for (let channel = 0; channel < 4; channel++) {
            assert.ok(Math.abs(pixel[channel] - expected[channel]) <= 1,
                `persistent frame ${index} channel ${channel}: got ${pixel}, expected ${expected}`)
        }
    }
    assert.deepEqual(frames.ordinary.pixels[0], expected, 'control must begin with a visible write')
    assert.deepEqual(frames.ordinary.pixels[2], [0, 0, 0, 0],
        'control must expose the skipped-write regression without persistence')
    assert.deepEqual(errors, [], 'browser must not report errors')
    console.log('WebGL2 write-first persistent memory retains RGBA across three skipped producer frames')
} finally {
    await browser?.close()
    await releaseServer()
}
