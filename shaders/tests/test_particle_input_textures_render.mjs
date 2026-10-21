#!/usr/bin/env node
// Real GPU contract for particle source overrides and their inputTex fallback.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effectsDir = path.join(root, 'shaders/effects')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = effectsDir
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, effectsDir)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = new Map()

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: 128, height: 128 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(baseUrl)
        await page.setContent('<link rel="icon" href="data:,"><canvas width="128" height="128"></canvas>')
        await page.evaluate(async ({ baseUrl, backend }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            const renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 128, height: 128,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            window.renderer = renderer
            await renderer.loadManifest()
            await renderer.loadEffects(['synth/solid', 'synth/noise', 'render/pointsEmit', 'render/pointsRender',
                'points/flow', 'points/hydraulic', 'points/dla', 'points/physarum', 'points/life',
                'points/flock', 'points/physical', 'points/attractor', 'points/buddhabrot', 'points/lenia'])
            window.frame = async (dsl, effect, output) => {
                await renderer.compile(dsl)
                renderer.stop()
                renderer.render(0)
                await renderer.pipeline.backend.waitForIdle?.()
                const pass = renderer.pipeline.graph.passes.find(p => p.effectFunc === effect && p.outputs?.[output])
                const surface = renderer.pipeline.surfaces.get(pass.outputs[output].slice(7))
                const pixels = await renderer.pipeline.backend.readPixels(surface.read)
                return { backend: renderer.pipeline.backend.getName().toLowerCase(), values: Array.from(pixels.data) }
            }
        }, { baseUrl, backend })

        const dsl = ({ effect = '', params = '', render = false,
            source = 'solid(color: #ff0000)' } = {}) => `search synth, render, points\n${source}.write(o1)\nsolid(color: #00ff00).pointsEmit(stateSize: x64, layout: grid, resetState: true)${effect ? `.${effect}(${params})` : ''}${render ? '.pointsRender(density: 100, intensity: 0, inputIntensity: 0)' : ''}.write(o0)\nrender(o0)`
        const read = (program, effect, output) => page.evaluate(
            ({ program, effect, output }) => window.frame(program, effect, output), { program, effect, output })

        const defaultColor = await read(dsl(), 'pointsEmit', 'outRGBA')
        assert.equal(defaultColor.backend, backend)
        assert.deepEqual(defaultColor.values.slice(0, 4), [0, 255, 0, 255], `${backend}: emitter defaults to inputTex`)

        for (const effect of ['flow', 'hydraulic', 'dla', 'physarum', 'life',
            'flock', 'physical', 'attractor', 'buddhabrot', 'lenia']) {
            const fallback = await read(dsl({ effect }), effect, 'outRGBA')
            const none = await read(dsl({ effect, params: 'diffuseTex: none' }), effect, 'outRGBA')
            const named = await read(dsl({ effect, params: 'diffuseTex: read(o1)' }), effect, 'outRGBA')
            assert.deepEqual(none.values, fallback.values, `${backend}: ${effect} none preserves omitted particle color`)
            assert.notDeepEqual(named.values, fallback.values, `${backend}: ${effect} explicit diffuse changes particle color`)
            assert.ok(named.values.some((v, i) => i % 4 === 0 && v > named.values[i + 1]),
                `${backend}: ${effect} explicit diffuse produces red particles`)
        }

        const defaultFlow = await read(dsl({ effect: 'flow', params: 'inputWeight: 100' }), 'flow', 'outXYZ')
        const namedFlow = await read(dsl({ effect: 'flow', params: 'inputWeight: 100, heightTex: read(o1)' }), 'flow', 'outXYZ')
        const noneFlow = await read(dsl({ effect: 'flow', params: 'inputWeight: 100, heightTex: none' }), 'flow', 'outXYZ')
        assert.deepEqual(noneFlow.values, defaultFlow.values, `${backend}: flow none preserves inputTex movement`)
        assert.notDeepEqual(defaultFlow.values, namedFlow.values, `${backend}: flow takes heightTex`)

        for (const { effect, surface, source } of [
            { effect: 'hydraulic', surface: 'heightTex', source: 'noise(seed: 1)' },
            { effect: 'dla', surface: 'heightTex' },
            { effect: 'physarum', surface: 'heightTex' }
        ]) {
            const options = { effect, params: 'inputWeight: 100', source }
            const fallback = await read(dsl(options), effect, 'outXYZ')
            const none = await read(dsl({ ...options, params: `inputWeight: 100, ${surface}: none` }), effect, 'outXYZ')
            const named = await read(dsl({ ...options, params: `inputWeight: 100, ${surface}: read(o1)` }), effect, 'outXYZ')
            assert.deepEqual(none.values, fallback.values, `${backend}: ${effect} none preserves inputTex movement`)
            assert.notDeepEqual(fallback.values, named.values, `${backend}: ${effect} takes ${surface}`)
        }

        await read(dsl({ effect: 'flow', render: true }), 'flow', 'outRGBA')
        const defaultPixels = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
        await read(dsl({ effect: 'flow', params: 'diffuseTex: read(o1)', render: true }), 'flow', 'outRGBA')
        const namedPixels = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
        let green = 0, red = 0, wrongDefault = 0, wrongNamed = 0
        for (let i = 0; i < defaultPixels.length; i += 4) {
            if (defaultPixels[i + 1] > defaultPixels[i] + 20 && defaultPixels[i + 3] > 0) green++
            if (namedPixels[i] > namedPixels[i + 1] + 20 && namedPixels[i + 3] > 0) red++
            if (defaultPixels[i] > defaultPixels[i + 1] + 20 && defaultPixels[i + 3] > 0) wrongDefault++
            if (namedPixels[i + 1] > namedPixels[i] + 20 && namedPixels[i + 3] > 0) wrongNamed++
        }
        assert.ok(green > 0, `${backend}: fallback color is visible on rendered particles`)
        assert.ok(red > 0, `${backend}: named diffuse color is visible on rendered particles`)
        assert.equal(wrongDefault, 0, `${backend}: fallback render has no red particles`)
        assert.equal(wrongNamed, 0, `${backend}: named diffuse render has no green particles`)
        for (const [name, pixels] of [['fallback', defaultPixels], ['diffuse', namedPixels]]) {
            if (backend === 'webgl2') captures.set(name, pixels)
            else {
                const reference = captures.get(name)
                let mismatch = 0
                for (let i = 0; i < pixels.length; i++) if (pixels[i] !== reference[i]) mismatch++
                assert.equal(mismatch, 0, `${name}: WebGL2 and WebGPU rendered pixels match`)
            }
        }
        assert.deepEqual(errors, [], `${backend}: clean browser console`)
        console.log(`PASS ${backend}: particle source fallbacks, overrides, and visible color`)
        await page.close()
    }
} finally {
    await browser.close()
    await releaseServer()
}
