#!/usr/bin/env node
// Software rasterizer build regression for the PCG prng() sign fold.
//
// prng() folded each component's sign through a float ternary
// (`p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0`). SwiftShader and llvmpipe build
// each of those as a branch, and effects that call prng() inside loops then
// spend minutes building one pipeline, as the curated "puddle" program did.
// The fold now selects per component with a boolean mix(), as the WGSL does
// with select(). This test renders each effect that defines prng() on
// SwiftShader, WebGL2 only (software rendering never uses WebGPU), and fails
// when a first frame misses the deadline or comes back blank.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effectsDir = path.join(repoRoot, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(Number(process.env.SHADE_VIEWER_PORT) || undefined, repoRoot, effectsDir)
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

const SIZE = 64
// The deadline only turns a minutes-long build into a prompt, specific failure.
const FRAME_DEADLINE_MS = 30_000

const PRNG = /vec3 prng\s*\(vec3 p\)\s*\{([^}]*)\}/
const glslSources = fs.readdirSync(effectsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(ns => fs.readdirSync(path.join(effectsDir, ns.name)).map(name => path.join(ns.name, name, 'glsl')))
    .filter(dir => fs.existsSync(path.join(effectsDir, dir)))
    .flatMap(dir => fs.readdirSync(path.join(effectsDir, dir)).map(file => path.join(dir, file)))

// The effects whose prng() folds the sign of each component.
const prngEffects = [
    'classicNoisedeck/caustic', 'classicNoisedeck/cellNoise', 'classicNoisedeck/moodscape',
    'classicNoisedeck/noise', 'classicNoisedeck/noise3d', 'classicNoisedeck/splat',
    'filter/corrupt', 'filter/lensWarp', 'filter/warp', 'mixer/cellSplit',
    'synth/cell', 'synth/gabor', 'synth/gradient', 'synth/noise', 'synth/perlin',
]

const CASES = [
    ...prngEffects.map(id => {
        const parityCase = JSON.parse(fs.readFileSync(path.join(effectsDir, id, 'parity-case.json'), 'utf8'))
        return { label: id, effects: parityCase.effects, dsl: parityCase.dsl }
    }),
    {
        label: 'puddle (classic sine noise chain)',
        effects: ['classicNoisedeck/noise', 'filter/adjust', 'filter/celShading', 'filter/palette', 'filter/outline'],
        dsl: `search synth, filter, classicNoisedeck
from(classicNoisedeck, noise(type: sine, octaves: 1, xScale: 72.24, yScale: 26.02, seed: 50, speed: 100, colorMode: srgb))
  .adjust(hueRange: 200, saturation: 2.62, brightness: 0.66)
  .celShading(levels: 3, gamma: 0.9, antialias: true, edgeWidth: 0, edgeThreshold: 1)
  .palette(index: dealerHat, offset: 29)
  .outline()
  .write(o0)
render(o0)`,
    },
]

async function firstFrame(testCase) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
    let timer
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`first frame did not complete within ${FRAME_DEADLINE_MS / 1000}s`)), FRAME_DEADLINE_MS)
    })
    try {
        const result = await Promise.race([page.evaluate(async ({ baseUrl, size, testCase }) => {
            const { CanvasRenderer, detectSoftwareRendering } = await import(`${baseUrl}/shaders/src/index.js`)
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = size
            document.body.appendChild(canvas)
            const renderer = new CanvasRenderer({ canvas, width: size, height: size, basePath: `${baseUrl}/shaders`, preferWebGPU: false })
            await renderer.loadManifest()
            await renderer.loadEffects(testCase.effects)
            const started = performance.now()
            try { await renderer.compile(testCase.dsl) }
            catch (e) { throw new Error(e instanceof Error ? e.message : JSON.stringify(e)) }
            renderer.stop()
            renderer.render(0)
            const gl = renderer.pipeline.backend.gl
            const pixels = new Uint8Array(size * size * 4)
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
            const colors = new Set()
            for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`)
            return {
                renderer: detectSoftwareRendering().renderer,
                backend: renderer.pipeline.backend.getName(),
                ms: Math.round(performance.now() - started),
                uniqueColors: colors.size,
            }
        }, { baseUrl, size: SIZE, testCase }), deadline])
        assert.deepEqual(errors, [], 'browser errors')
        return result
    } finally {
        clearTimeout(timer)
        await Promise.race([page.close(), new Promise(resolve => setTimeout(resolve, 5000))])
    }
}

const failures = []
try {
    for (const file of glslSources) {
        const body = fs.readFileSync(path.join(effectsDir, file), 'utf8').match(PRNG)?.[1]
        if (body?.includes('?')) failures.push(`${file}: prng() folds with a float ternary`)
    }
    for (const testCase of CASES) {
        try {
            const result = await firstFrame(testCase)
            assert.match(result.renderer, /SwiftShader/, 'the test browser must render through SwiftShader')
            assert.equal(result.backend, 'WebGL2')
            assert.ok(result.uniqueColors > 1, `frame must vary, got ${result.uniqueColors} unique colors`)
            console.log(`PASS ${testCase.label}: first frame in ${result.ms} ms (${result.uniqueColors} unique colors)`)
        } catch (error) {
            failures.push(`${testCase.label}: ${error.message}`)
            console.log(`FAIL ${testCase.label}: ${error.message}`)
        }
    }
} finally {
    // A busy software GPU process can hold browser cleanup; bound it so a red run ends promptly.
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))])
    await Promise.race([releaseServer(), new Promise(resolve => setTimeout(resolve, 5000))])
}

if (failures.length) {
    console.error(`\nprng software build regression: ${failures.length} failure(s):\n${failures.join('\n')}`)
    process.exit(1)
}
console.log(`\nprng(): ${prngEffects.length} effects and the puddle chain build promptly on SwiftShader`)
