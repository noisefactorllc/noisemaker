#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// classicNoisedeck/effects on WebGPU must render what WebGL2 renders. Each
// case renders on both backends; the page asserts which backend executed, and
// the presented canvases must match byte for byte. The effect's
// parity-case.json holds one attested case; these cases cover the default
// parameters, every effect mode and every flip mode under the transforms,
// cga and subpixel above effectAmt 1, and input outside 0..1.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const definition = (await import('../effects/classicNoisedeck/effects/definition.js')).default
const effectModes = Object.keys(definition.globals.effect.choices)
const flipModes = Object.entries(definition.globals.flip.choices)
    .filter(([name, value]) => value !== null && name !== 'none').map(([name]) => name)

const transforms = 'scaleAmt: 150, rotation: 30, offsetX: 20, offsetY: -15'
// Bit-exactness is achieved by mirroring every floating-point evaluation
// between GLSL ES 3.0 (ANGLE on Metal, fast math) and WGSL (Dawn on Metal,
// relaxed math). The uv chain multiplies CPU-computed reciprocals
// (invFullResolution, aspect, aspectInv) instead of dividing, because Dawn
// lowers a runtime division to an approximate reciprocal multiply; rotate2D's
// products, the offset shifts, the scale rescale and zoomBlur's tap chain
// carry min/max barriers so relaxed math cannot contract multiply-add pairs
// the way ANGLE's fast math does; zoomBlur's final weighted average divides
// by a Newton-refined reciprocal; the shared map's division and the scale
// division are Newton-refined too; zoomBlur's taps sample computed texel
// centers so no nearest-sampler tie can differ; and the final color carries a
// small deterministic downward pull (a single same-constant multiply) that
// lands any boundary-adjacent pair whose residual divergence is smaller than
// the bias on the same side of every 8-bit boundary.
const program = (args, pre = '') =>
    `search classicNoisedeck\n\nnoise(seed: 1)${pre}.effects(${args}).write(o0)\nrender(o0)`
const cases = [
    { id: 'default parameters', dsl: program('') },
    { id: 'parity-case.json', dsl: program(`effect: shadow, ${transforms}, flip: upToDown`) },
    ...['offsetY: -15', 'scaleAmt: 150', 'rotation: 30', 'offsetX: 20'].map((t) => (
        { id: `cga, ${t}`, dsl: program(`effect: cga, ${t}`) })),
    { id: 'cga effectAmt 4, transforms, flip all', dsl: program(`effect: cga, effectAmt: 4, ${transforms}, flip: all`) },
    ...[4, 20].map((amount) => ({ id: `subpixel effectAmt ${amount}`, dsl: program(`effect: subpixel, effectAmt: ${amount}`) })),
    { id: 'subpixel effectAmt 4, transforms', dsl: program(`effect: subpixel, effectAmt: 4, ${transforms}`) },
    ...effectModes.flatMap((mode) => [1, 4].map((amount) => ({
        id: `${mode} effectAmt ${amount}, transforms, upToDown`,
        dsl: program(`effect: ${mode}, effectAmt: ${amount}, ${transforms}, flip: upToDown`),
    }))),
    ...flipModes.map((flip) => ({ id: `flip ${flip}, transforms`, dsl: program(`${transforms}, flip: ${flip}`) })),
    // Sizes that are neither square nor powers of two. At 121x41, n * (1 / n)
    // is not exactly 1, so the GLSL's (uv * fullResolution) / textureSize
    // sampling coordinate is not exactly uv.
    ...[[120, 72], [121, 41]].flatMap((size) => effectModes.map((mode) => ({
        id: `${mode} effectAmt 7, other transforms, rlDu, ${size.join('x')}`,
        size,
        dsl: program(`effect: ${mode}, effectAmt: 7, scaleAmt: 85, rotation: -47, offsetX: 33, offsetY: 61, flip: rlDu`),
    }))),
    // A first pass pushes the input above 1 and below 0.
    ...['cga', 'edge', 'litEdge', 'derivDivide'].flatMap((mode) => [100, -100].map((intensity) => ({
        id: `${mode} effectAmt 4 after intensity ${intensity}`,
        dsl: program(`effect: ${mode}, effectAmt: 4`, `.effects(intensity: ${intensity})`),
    }))),
]

const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

async function openBackend(backend) {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (['error', 'warning'].includes(message.type())) errors.push(message.text())
    })
    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
    await page.setContent('<link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block}</style>')
    // One canvas and renderer per frame size; each case recompiles it.
    await page.evaluate(async ({ baseUrl, backend }) => {
        const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
        const renderers = new Map()
        window.present = async (dsl, width, height) => {
            const key = `${width}x${height}`
            if (!renderers.has(key)) {
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                document.body.appendChild(canvas)
                const renderer = new CanvasRenderer({ canvas, width, height,
                    basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                await renderer.loadManifest()
                await renderer.loadEffects(['classicNoisedeck/noise', 'classicNoisedeck/effects'])
                renderers.set(key, { canvas, renderer })
            }
            const { canvas, renderer } = renderers.get(key)
            await renderer.compile(dsl)
            renderer.stop()
            renderer.render(0)
            renderer.render(0)
            await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
            return { name: renderer.pipeline.backend.getName(), png: canvas.toDataURL('image/png') }
        }
    }, { baseUrl, backend })
    return { backend, page, errors }
}

async function present({ backend, page }, { dsl, size: [width, height] = [64, 64] }) {
    const result = await page.evaluate(({ dsl, width, height }) => window.present(dsl, width, height),
        { dsl, width, height })
    assert.equal(result.name.toLowerCase(), backend, 'the requested backend must execute')
    return PNG.sync.read(Buffer.from(result.png.slice(result.png.indexOf(',') + 1), 'base64'))
}

function compare(webgl2, webgpu) {
    assert.equal(webgpu.width, webgl2.width)
    assert.equal(webgpu.height, webgl2.height)
    let mismatched = 0
    let maxDiff = 0
    const colors = new Set()
    for (let i = 0; i < webgl2.data.length; i += 4) {
        let pixelDiff = 0
        for (let channel = 0; channel < 4; channel++) {
            pixelDiff = Math.max(pixelDiff, Math.abs(webgl2.data[i + channel] - webgpu.data[i + channel]))
        }
        if (pixelDiff > 0) mismatched++
        maxDiff = Math.max(maxDiff, pixelDiff)
        colors.add(webgl2.data.readUInt32BE(i))
    }
    return { mismatched, pixels: webgl2.data.length / 4, maxDiff, colors: colors.size }
}

const failures = []
try {
    const webgl2 = await openBackend('webgl2')
    const webgpu = await openBackend('webgpu')
    for (const c of cases) {
        const result = compare(await present(webgl2, c), await present(webgpu, c))
        const summary = `${c.id}: ${result.mismatched}/${result.pixels} pixels differ, maxDiff ${result.maxDiff}`
        if (result.mismatched > 0 || result.colors < 2) {
            failures.push(result.colors < 2 ? `${c.id}: the WebGL2 frame is flat` : summary)
            console.log(`FAIL ${summary}`)
        } else {
            console.log(`PASS ${summary}`)
        }
    }
    for (const { backend, errors } of [webgl2, webgpu]) {
        assert.deepEqual(errors, [], `${backend} console must be clean`)
    }
} finally {
    await browser.close()
    releaseServer()
}

assert.deepEqual(failures, [], `classicNoisedeck/effects WebGPU must match WebGL2 exactly:\n${failures.join('\n')}`)
console.log(`PASS classicNoisedeck/effects: ${cases.length} cases match WebGL2 exactly on WebGPU`)
