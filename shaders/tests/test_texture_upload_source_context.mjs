#!/usr/bin/env node
/*
 * Uploading a canvas must not give that canvas a rendering context.
 *
 * updateTextureFromSource() on WebGPU asked every source canvas for a 2D
 * context, to find the willReadFrequently overlays it uploads from
 * getImageData. On a canvas that had no context yet, that call created a 2D
 * context, and a canvas keeps the first context type it gets: a host that
 * uploaded another renderer's canvas before that renderer compiled (a mixer
 * taking a deck's canvas) left the renderer without a WebGPU or WebGL2
 * context, and its canvas never showed a frame.
 *
 * On each backend, a canvas without a context is uploaded as transparent
 * black, as WebGL2 uploads it, and must then still take a WebGPU or a WebGL2
 * context.
 *
 * Usage: node shaders/tests/test_texture_upload_source_context.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
let failed = false
function check(condition, label) {
    console.log(`${condition ? 'PASS' : 'FAIL'}: ${label}`)
    if (!condition) failed = true
}

async function uploadKeepsContext(preferWebGPU) {
    const expected = preferWebGPU ? 'WebGPU' : 'WebGL2'
    console.log(`-- ${expected}: an uploaded canvas without a context can still take one`)
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } })
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    try {
        await page.goto(`${base}/shaders/effects/manifest.json`)
        await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>')
        const result = await page.evaluate(async ({ base, preferWebGPU }) => {
            const { CanvasRenderer } = await import(`${base}/shaders/src/index.js`)
            const renderer = new CanvasRenderer({
                canvas: document.getElementById('c'),
                width: 64,
                height: 64,
                basePath: `${base}/shaders`,
                preferWebGPU,
            })
            await renderer.loadManifest()
            await renderer.loadEffects(['synth/noise'])
            await renderer.compile('search synth\nnoise(seed: 1).write(o0)\nrender(o0)')
            const take = async (type) => {
                const canvas = document.createElement('canvas')
                canvas.width = 32
                canvas.height = 32
                const upload = renderer.updateTextureFromSource('uploadProbeTex', canvas, { flipY: false })
                const read = await renderer.pipeline.backend.readPixels('uploadProbeTex')
                const nonzero = read?.data ? Array.prototype.filter.call(read.data, (v) => v !== 0).length : null
                return { upload, nonzero, context: !!canvas.getContext(type) }
            }
            return {
                backend: renderer.pipeline?.backend?.getName?.() ?? null,
                webgpu: typeof GPUCanvasContext === 'undefined' ? null : await take('webgpu'),
                webgl2: await take('webgl2'),
            }
        }, { base, preferWebGPU })
        check(result.backend === expected, `the renderer runs on ${expected} (${result.backend})`)
        check(result.webgl2.upload.width === 32 && result.webgl2.nonzero === 0,
            `the canvas uploads as transparent black (${JSON.stringify(result.webgl2)})`)
        check(result.webgpu?.context === true, `an uploaded canvas can still take a WebGPU context (${JSON.stringify(result.webgpu)})`)
        check(result.webgl2.context === true, `an uploaded canvas can still take a WebGL2 context (${JSON.stringify(result.webgl2)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

try {
    await uploadKeepsContext(false)
    await uploadKeepsContext(true)
} finally {
    await browser.close()
    releaseServer()
}

if (failed) process.exit(1)
console.log('\nAn uploaded canvas keeps its choice of rendering context')
