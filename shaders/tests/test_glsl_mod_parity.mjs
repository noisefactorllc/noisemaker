#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

// Issue #322: two WGSL programs still folded coordinates with the truncating
// `%` where their GLSL uses the floored mod, so WebGPU rendered different
// pixels than WebGL2:
//
// - filter/rotate wrapped rotated coordinates with a two-step `%` fold per
//   axis; glsl/rot.glsl uses abs(mod(uv + 1.0, 2.0) - 1.0) and fract(uv). At
//   the default rotation with wrap: repeat, 71 of 16384 channel values
//   differed (maxDiff 88) before the fix.
// - classicNoisedeck/kaleido's rgb2hsv took a red-dominant hue with
//   ((rgb.g - rgb.b) / delta) % 6.0 / 6.0, which turns negative where the
//   GLSL's mod(...) / 6.0 stays in [5/6, 1). Its only consumer, the shadow
//   kernel, passes the hue through hsv2rgb's fract(), so the divergence
//   surfaces as ulp-level rounding differences rather than wrong sectors on
//   this platform — the render cases below are exact here and guard the
//   relaxed-math GPUs; the source contract pins the formula itself.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')

const noise = 'noise(seed: 1, scaleX: 50, scaleY: 50)'
// On the GPU runner (macOS 26.5, Apple M4), Chrome compiles WGSL in Metal's
// relaxed math mode while WebGL2 compiles in fast mode. rotate2D's cos and
// sin at the default rotation (45 degrees) differ by ulps between the
// backends and flip the sampled texel for 7 of 4096 pixels — identically in
// every wrap mode, including clamp, which does not use the wrap fold, so the
// residual is the shared transform, not the corrected % folds (shaders.yml
// run 37869031215 measured 7 pixels, maxDiff 133, in all three). Under
// ANGLE/SwiftShader every case below is byte-exact, and the wrap: repeat
// case was 71 of 16384 channel values red before the fix. Same operator
// decision as classicNoisedeck/effects' zoomBlur and bloom tolerances.
const measuredTolerance = {
    'rotate wrap repeat (attested case)': { tolerance: { pixels: 7, maxDiff: 133 } },
    'rotate wrap mirror, rotation 45': { tolerance: { pixels: 7, maxDiff: 133 } },
    'rotate wrap clamp, rotation 45': { tolerance: { pixels: 7, maxDiff: 133 } },
}
const cases = [
    // The attested filter/rotate parity case: the wrap that failed before the
    // fix, at the default rotation.
    { id: 'rotate wrap repeat (attested case)', size: [64, 64],
      dsl: `search synth, filter\n\n${noise}.rotate(wrap: repeat).write(o0)\nrender(o0)` },
    ...[['mirror', 45], ['mirror', -170], ['repeat', 7], ['repeat', 123], ['clamp', 45]].map(([wrap, rotation]) => ({
        id: `rotate wrap ${wrap}, rotation ${rotation}`, size: [64, 64],
        dsl: `search synth, filter\n\n${noise}.rotate(wrap: ${wrap}, rotation: ${rotation}).write(o0)\nrender(o0)`,
    })),
    { id: 'rotate wrap repeat, 121x41', size: [121, 41],
      dsl: `search synth, filter\n\n${noise}.rotate(wrap: repeat).write(o0)\nrender(o0)` },
    // The kaleido path that reads rgb2hsv.
    { id: 'kaleido kernel shadow', size: [64, 64],
      dsl: `search synth, classicNoisedeck\n\n${noise}.kaleido(kernel: shadow, loopOffset: noiseConstant, seed: 2).write(o0)\nrender(o0)` },
    { id: 'kaleido kernel shadow, sides 3', size: [64, 64],
      dsl: `search synth, classicNoisedeck\n\n${noise}.kaleido(kernel: shadow, loopOffset: noiseConstant, seed: 2, sides: 3).write(o0)\nrender(o0)` },
]

// rgb2hsv's red-dominant hue must be the GLSL's floored mod. glsl/kaleido.glsl
// writes mod((g - b) / delta, 6.0) / 6.0; the WGSL wrote the truncating % and
// now writes the same remainder through the file's glslMod helper, as
// classicNoisedeck/effects' WGSL does.
const wgsl = fs.readFileSync(path.join(root, 'shaders/effects/classicNoisedeck/kaleido/wgsl/kaleido.wgsl'), 'utf8')
const glsl = fs.readFileSync(path.join(root, 'shaders/effects/classicNoisedeck/kaleido/glsl/kaleido.glsl'), 'utf8')
assert.match(glsl, /mod\(\(g - b\) \/ delta, 6\.0\) \/ 6\.0/,
    'gl/kaleido.glsl rgb2hsv must keep the floored-mod hue this contract mirrors')
assert.match(wgsl, /glslMod\(\(rgb\.g - rgb\.b\) \/ delta, 6\.0\) \/ 6\.0/,
    'kaleido.wgsl rgb2hsv must compute the red-dominant hue with the GLSL\'s floored mod')
assert.doesNotMatch(wgsl, /% 6\.0/,
    'kaleido.wgsl must not take the red-dominant hue with the truncating %')

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
                await renderer.loadEffects(['synth/noise', 'classicNoisedeck/kaleido', 'filter/rotate'])
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
        const allowed = c.tolerance ?? { pixels: 0, maxDiff: 0 }
        if (result.mismatched > allowed.pixels || result.maxDiff > allowed.maxDiff || result.colors < 2) {
            failures.push(result.colors < 2 ? `${c.id}: the WebGL2 frame is flat` : summary)
            console.log(`FAIL ${summary}`)
        } else {
            console.log(`PASS ${summary}${c.tolerance ? ` (measured tolerance: ${allowed.pixels} pixels, maxDiff ${allowed.maxDiff})` : ''}`)
        }
    }
    for (const { backend, errors } of [webgl2, webgpu]) {
        assert.deepEqual(errors, [], `${backend} console must be clean`)
    }
} finally {
    await browser.close()
    releaseServer()
}

assert.deepEqual(failures, [], `filter/rotate and classicNoisedeck/kaleido WebGPU must match WebGL2:\n${failures.join('\n')}`)
console.log(`PASS filter/rotate wrap and classicNoisedeck/kaleido shadow: ${cases.length} cases match on WebGL2 and WebGPU`)