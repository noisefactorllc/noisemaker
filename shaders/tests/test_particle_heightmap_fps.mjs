// Hardware acceptance: do not run this FPS gate on a software GPU CI runner.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import heightGrid from '../effects/points/heightGrid/definition.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const results = []
try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(baseUrl)
        await page.setContent('<canvas width="1280" height="720"></canvas>')
        const result = await page.evaluate(async ({ baseUrl, backend, dsl }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            const renderer = new CanvasRenderer({
                canvas: document.querySelector('canvas'), width: 1280, height: 720,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu'
            })
            await renderer.loadManifest()
            await renderer.loadEffects(['synth/solid', 'synth/perlin', 'render/pointsEmit', 'points/heightGrid', 'render/pointsBillboardRender'])
            await renderer.compile(dsl)
            renderer.stop()
            const pipeline = renderer.pipeline, gpu = pipeline.backend, gl = gpu.gl
            gpu.device?.addEventListener('uncapturederror', event => console.error(event.error.message))
            const step = pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsBillboardRender').stepIndex
            const apply = values => renderer.applyStepParameterValues({ [`step_${step}`]: values })
            const probe = new Uint8Array(4)
            const idle = async () => {
                if (gl) {
                    // One readback per batch ensures GPU completion without
                    // putting a synchronous readback in every timed frame.
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe)
                    if (gl.isContextLost()) throw new Error('WebGL context lost during FPS acceptance')
                } else await gpu.queue.onSubmittedWorkDone()
            }
            const cases = []
            for (const parameters of [
                { aperture: 0, focalDistance: 65 },
                { aperture: 1.5, focalDistance: 65 },
                { aperture: 20, focalDistance: 65 },
                { aperture: 20, focalDistance: 200 },
                { aperture: 20, focalDistance: 500 },
                { animated: true }
            ]) {
                const renderFrame = frame => {
                    if (parameters.animated) apply({
                        aperture: 10 + 10 * Math.sin(frame * 0.08),
                        focalDistance: 250 + 249 * Math.sin(frame * 0.05)
                    })
                    renderer.render((frame % 100) / 100)
                }
                if (!parameters.animated) apply(parameters)
                for (let frame = 0; frame < 8; frame++) renderFrame(frame)
                await idle()
                const start = performance.now()
                for (let frame = 0; frame < 60; frame++) renderFrame(frame)
                await idle()
                const throughputMs = (performance.now() - start) / 60
                const intervals = await new Promise(resolve => {
                    let previous, frame = 0
                    const samples = []
                    const onFrame = time => {
                        if (previous !== undefined && frame > 30) samples.push(time - previous)
                        previous = time
                        if (frame++ >= 150) { resolve(samples); return }
                        renderFrame(frame)
                        requestAnimationFrame(onFrame)
                    }
                    requestAnimationFrame(onFrame)
                })
                const pixels = await gpu.readPixels(pipeline.surfaces.get('o0').read)
                if (!pixels.data.some((value, index) => index % 4 < 3 && value > 0)) {
                    throw new Error('FPS acceptance rendered an empty landscape')
                }
                const sorted = [...intervals].sort((a, b) => a - b)
                cases.push({
                    ...parameters, throughputMs,
                    fps: 1000 * intervals.length / intervals.reduce((a, b) => a + b),
                    p95IntervalMs: sorted[Math.floor(sorted.length * 0.95)]
                })
            }
            return {
                backend: gpu.getName().toLowerCase(), resolution: [1280, 720], particleCount: 65536,
                device: gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) : gpu.adapter?.info?.description,
                cases
            }
        }, { baseUrl, backend, dsl: heightGrid.defaultProgram })
        results.push(result)
        console.log(JSON.stringify(result, null, 2))
        assert.equal(result.backend, backend, 'the requested hardware backend must run')
        assert.deepEqual(errors, [], 'no browser or GPU validation errors')
        // Allow scheduler jitter around a 60 Hz display, while requiring the
        // completed GPU batches themselves to fit the 16.7 ms frame budget.
        assert.ok(result.cases.every(sample => sample.throughputMs <= 1000 / 60 && sample.fps >= 58),
            `${backend}: particle focus must sustain 60 FPS with 65,536 particles at 1280×720`)
        await page.close()
    }
} finally {
    if (process.env.PARTICLE_FPS_RESULTS) fs.writeFileSync(process.env.PARTICLE_FPS_RESULTS, JSON.stringify(results, null, 2))
    await browser.close()
    await releaseServer()
}
