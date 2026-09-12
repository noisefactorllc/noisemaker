import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

// Catch alpha deposition overwriting additive light when pass conditions are lost.
// 4096 overlapping #804020 particles must saturate all channels in additive mode;
// premultiplied alpha OVER must converge to the original particle color instead.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = new Map()
const failures = []
const size = 64

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: size, height: size } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(baseUrl)
        await page.setContent(`<canvas width="${size}" height="${size}"></canvas>`)
        await page.evaluate(async ({ baseUrl, backend, size }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: size, height: size,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await renderer.loadManifest()
            await renderer.loadEffects(['synth/solid', 'render/pointsEmit', 'render/pointsBillboardRender'])
        }, { baseUrl, backend, size })

        async function capture(name, dsl, values, expected, surface = 'o0', time = 0) {
            const result = await page.evaluate(async ({ dsl, values, surface, time }) => {
                const r = window.renderer
                if (dsl) {
                    try { await r.compile(dsl) } catch (error) { throw new Error(error.message || JSON.stringify(error)) }
                    r.stop()
                }
                if (values) {
                    const step = r.pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsBillboardRender').stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: values })
                }
                r.render(time)
                const p = r.pipeline
                await p.backend.device?.queue.onSubmittedWorkDone()
                const raw = await p.backend.readPixels(p.surfaces.get(surface).read)
                const center = (Math.floor(raw.height / 2) * raw.width + Math.floor(raw.width / 2)) * 4
                return { backend: p.backend.getName().toLowerCase(), pixel: Array.from(raw.data.slice(center, center + 4)) }
            }, { dsl, values, surface, time })
            assert.equal(result.backend, backend, 'the requested backend must execute')
            if (result.pixel.some((value, channel) => Math.abs(value - expected[channel]) > 1)) {
                failures.push(`${backend} ${name}: expected ${expected}, got ${result.pixel}`)
            }
            const png = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true }))
            if (backend === 'webgl2') captures.set(name, png.data)
            else if (!png.data.equals(captures.get(name))) failures.push(`${name}: backend pixels must match exactly`)
        }

        const dsl = (view, mode, extra = '') => `search synth, render
solid(color: #804020).pointsEmit(stateSize: x64, layout: center, resetState: true)
  .pointsBillboardRender(viewMode: ${view}, rotateX: 0, shapeMode: square, pointSize: 16,
    blendMode: ${mode}, density: 100, depositOpacity: 20, intensity: 0, inputIntensity: 0${extra}).write(o0)
render(o0)`
        for (const view of ['flat', 'ortho', 'perspective']) {
            await capture(`${view}-additive`, dsl(view, 'additive'), null, [255, 255, 255, 255])
            await capture(`${view}-live-alpha`, null, { blendMode: 1 }, [128, 64, 32, 255])
            await capture(`${view}-live-additive`, null, { blendMode: 0 }, [255, 255, 255, 255])
            await capture(`${view}-alpha`, dsl(view, 'alpha'), null, [128, 64, 32, 255])
        }
        // One particle at 20% opacity, then one more deposit with no decay:
        // additive light doubles; alpha coverage is 0.2 + 0.2 * 0.8 = 0.36.
        await capture('single-additive', dsl('flat', 'additive').replace('density: 100', 'density: 0.001'), null, [26, 13, 6, 26])
        await capture('additive-trail', null, { intensity: 100 }, [51, 26, 13, 51])
        await capture('single-alpha', dsl('flat', 'alpha').replace('density: 100', 'density: 0.001'), null, [128, 64, 32, 51])
        await capture('alpha-trail', null, { intensity: 100 }, [128, 64, 32, 92])
        await capture('global-default-base', dsl('flat', 'alpha').replace('density: 100', 'density: 0.001'), null, [128, 64, 32, 51])
        await page.evaluate(() => window.renderer.setUniform('blendMode', 0))
        await capture('step-overrides-global', null, { blendMode: 1, intensity: 100 }, [128, 64, 32, 92])
        for (const [control, expected] of [
            ['osc(min: 0, max: 0)', [255, 255, 255, 255]],
            ['osc(min: 1, max: 1)', [128, 64, 32, 255]],
            ['osc(min: 0.4, max: 0.4)', [255, 255, 255, 255]],
            ['osc(min: 0.6, max: 0.6)', [128, 64, 32, 255]],
            ['midi(channel: 1, min: 1, max: 1)', [128, 64, 32, 255]]
        ]) {
            await capture(control, dsl('flat', control), null, expected)
        }
        await capture('automated-additive', dsl('flat', 'osc(type: oscKind.square)'), null, [255, 255, 255, 255])
        await capture('automated-alpha', null, null, [128, 64, 32, 255], 'o0', 0.75)
        await capture('automated-additive-again', null, null, [255, 255, 255, 255], 'o0', 0.25)
        await capture('defocused-additive', dsl('perspective', 'additive', ', aperture: 20, focalDistance: 1'), null, [255, 255, 255, 255])
        // Separate instances must retain their own blend selection in one graph.
        const mixed = `${dsl('flat', 'additive').split('render(o0)')[0]}
solid(color: #804020).pointsEmit(stateSize: x64, layout: center, resetState: true)
  .pointsBillboardRender(blendMode: alpha, density: 100, shapeMode: square, pointSize: 16,
    depositOpacity: 20, intensity: 0, inputIntensity: 0).write(o1)
render(o0)`
        await capture('mixed-additive', mixed, null, [255, 255, 255, 255])
        await capture('mixed-alpha', null, null, [128, 64, 32, 255], 'o1')
        assert.deepEqual(errors, [], `${backend}: no browser or GPU errors`)
        console.log(`Checked ${backend}: additive accumulation, alpha OVER, live selection, focus, and separate instances`)
        await page.close()
    }
    assert.deepEqual(failures, [], 'billboard blend modes must retain their distinct accumulation behavior')
    console.log('PASS: billboard blend modes and exact backend pixel parity')
} finally {
    await browser.close()
    await releaseServer()
}
