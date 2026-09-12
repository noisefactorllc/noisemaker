import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = new Map(), failures = []
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
        async function capture(name, options, expected) {
            const result = await page.evaluate(async options => {
                const { view = 'perspective', reverse = false, opacity = 100, rotateY = 0, posZ = 0,
                    shape = 'square', sample = [32, 32], mode = 'alpha', flat = false, live = false } = options
                const r = window.renderer
                if (!live) {
                    try {
                        await r.compile(`search synth, render\nsolid().pointsEmit(stateSize: x64).pointsBillboardRender(viewMode: ${view}, blendMode: ${mode}, rotateX: 0, rotateY: ${rotateY}, posZ: ${posZ}, pointSize: 32, shapeMode: ${shape}, depositOpacity: ${opacity}, density: 100, intensity: 0, inputIntensity: 0).write(o0)\nrender(o0)`)
                    } catch (error) { throw new Error(error.message || JSON.stringify(error)) }
                    r.stop()
                } else {
                    const step = r.pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsBillboardRender').stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: { rotateY } })
                }
                const b = r.pipeline.backend
                const xyz = new Float32Array(64 * 64 * 4), rgba = new Float32Array(xyz.length)
                const near = reverse ? xyz.length - 4 : 0, far = reverse ? 0 : xyz.length - 4
                xyz.set([flat ? 0.5 : 0, flat ? 0.5 : 0, 20, 1], near)
                xyz.set([flat ? 0.5 : 0, flat ? 0.5 : 0, -20, 1], far)
                rgba.set([1, 0, 0, 1], near); rgba.set([0, 0, 1, 1], far)
                b.uploadDataTexture('depth_fixture_xyz', xyz, 64, 64)
                b.uploadDataTexture('depth_fixture_rgba', rgba, 64, 64)
                for (const pass of r.pipeline.graph.passes) {
                    if (pass.effectFunc !== 'pointsBillboardRender') continue
                    if (pass.inputs.xyzTex) pass.inputs.xyzTex = 'depth_fixture_xyz'
                    if (pass.inputs.rgbaTex) pass.inputs.rgbaTex = 'depth_fixture_rgba'
                }
                r.render(0)
                await b.device?.queue.onSubmittedWorkDone()
                const raw = await b.readPixels(r.pipeline.surfaces.get('o0').read)
                const center = (sample[1] * raw.width + sample[0]) * 4
                return { backend: b.getName().toLowerCase(), pixel: Array.from(raw.data.slice(center, center + 4)) }
            }, options)
            assert.equal(result.backend, backend, 'the requested backend must execute')
            if (result.pixel.some((value, i) => Math.abs(value - expected[i]) > 1)) {
                failures.push(`${backend} ${name}: expected ${expected}, got ${result.pixel}`)
            }
            const pixels = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            if (backend === 'webgl2') captures.set(name, pixels)
            else if (!pixels.equals(captures.get(name))) failures.push(`${name}: backend pixels differ`)
        }
        for (const view of ['perspective', 'ortho']) {
            await capture(`${view}-near-first`, { view }, [255, 0, 0, 255])
            await capture(`${view}-near-last`, { view, reverse: true }, [255, 0, 0, 255])
            // Red at 50% over blue at 50%: premultiplied (0.5, 0, 0.25), alpha 0.75.
            await capture(`${view}-translucent`, { view, opacity: 50 }, [170, 0, 85, 191])
            await capture(`${view}-translucent-reversed`, { view, opacity: 50, reverse: true }, [170, 0, 85, 191])
            await capture(`${view}-turned`, { view, rotateY: Math.PI }, [0, 0, 255, 255])
            await capture(`${view}-live-turn`, { view, live: true }, [255, 0, 0, 255])
        }
        await capture('additive', { mode: 'additive' }, [255, 0, 255, 255])
        await capture('additive-reversed', { mode: 'additive', reverse: true }, [255, 0, 255, 255])
        await capture('flat-order', { view: 'flat', flat: true }, [0, 0, 255, 255])
        await capture('transparent-hole', { shape: 'ring', sample: [38, 32] }, [0, 0, 255, 255])
        await capture('near-plane-clipping', { posZ: 70 }, [0, 0, 255, 255])
        // Validate the entire GPU permutation, including dead slots and tied
        // depths. This catches missing/duplicated particles and incomplete runs.
        const sizes = process.argv.includes('--large') ? [64, 128, 256, 512, 1024, 2048] : [64, 128, 256]
        for (const fixture of [...sizes.map(stateSize => ({ stateSize })),
            { stateSize: 128, initialSize: 64 }, { stateSize: 64, initialSize: 256 }, { stateSize: 128, invalidPositions: true }]) {
            const { stateSize } = fixture
            const sorted = await page.evaluate(async ({ stateSize, initialSize = stateSize, invalidPositions = false }) => {
                const r = window.renderer, count = stateSize * stateSize
                await r.compile(`search synth, render\nsolid().pointsEmit(stateSize: x${initialSize}).pointsBillboardRender(viewMode: perspective, blendMode: alpha, rotateX: 0, density: 0, intensity: 0, inputIntensity: 0).write(o0)\nrender(o0)`)
                r.stop()
                if (initialSize !== stateSize) {
                    const step = r.pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsEmit').stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: { stateSize } })
                }
                const b = r.pipeline.backend, source = new Float32Array(count * 4)
                for (let i = 0; i < count; i++) {
                    source[i * 4 + 2] = (((i * 1664525 + 1013904223) >>> 0) % 257 - 128) / 2
                    source[i * 4 + 3] = i % 17 === 0 ? 0 : 1
                }
                if (invalidPositions) {
                    source[6] = NaN; source[10] = Infinity; source[14] = -Infinity
                    source[18] = Math.fround(3.402823466e38)
                }
                b.uploadDataTexture('depth_fixture_xyz', source, stateSize, stateSize)
                for (const pass of r.pipeline.graph.passes) {
                    if (pass.effectFunc === 'pointsBillboardRender' && pass.inputs.xyzTex) pass.inputs.xyzTex = 'depth_fixture_xyz'
                }
                r.render(0)
                const deposit = r.pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsBillboardRender' && pass.drawMode === 'billboards')
                const tex = b.textures.get(deposit.inputs.orderTex)
                if (tex.width !== stateSize || tex.height !== stateSize) return { width: tex.width, height: tex.height, invalid: 1, count }
                let data
                if (b.gl) {
                    const gl = b.gl, previous = gl.getParameter(gl.FRAMEBUFFER_BINDING), fbo = gl.createFramebuffer()
                    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.handle, 0)
                    data = new Float32Array(count * 4)
                    gl.readPixels(0, 0, stateSize, stateSize, gl.RGBA, gl.FLOAT, data)
                    gl.bindFramebuffer(gl.FRAMEBUFFER, previous); gl.deleteFramebuffer(fbo)
                } else {
                    const buffer = b.device.createBuffer({ size: count * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
                    const encoder = b.device.createCommandEncoder()
                    encoder.copyTextureToBuffer({ texture: tex.handle }, { buffer, bytesPerRow: stateSize * 16 }, { width: stateSize, height: stateSize })
                    b.queue.submit([encoder.finish()]); await buffer.mapAsync(GPUMapMode.READ)
                    data = new Float32Array(buffer.getMappedRange().slice(0))
                    buffer.unmap(); buffer.destroy()
                }
                const seen = new Uint8Array(count)
                let invalid = 0, previousKey = -Infinity, previousId = -1
                let maximumKey = -Infinity
                for (let id = 0; id < count; id++) {
                    if (source[id * 4 + 3] && Number.isFinite(source[id * 4 + 2])) maximumKey = Math.max(maximumKey, source[id * 4 + 2] - 80)
                }
                for (let i = 0; i < count; i++) {
                    const key = data[i * 4], id = data[i * 4 + 1]
                    if (!Number.isInteger(id) || id < 0 || id >= count || seen[id]) { invalid++; continue }
                    seen[id] = 1
                    const expectedKey = source[id * 4 + 3] && Number.isFinite(source[id * 4 + 2])
                        ? Math.fround(source[id * 4 + 2] - 80) : null
                    if ((expectedKey === null ? !Number.isFinite(key) || key < maximumKey : key !== expectedKey) ||
                        key < previousKey || (key === previousKey && id <= previousId)) invalid++
                    previousKey = key; previousId = id
                }
                return { width: tex.width, height: tex.height, invalid, count }
            }, fixture)
            if (sorted.width !== stateSize || sorted.height !== stateSize || sorted.invalid !== 0 || sorted.count !== stateSize * stateSize) {
                failures.push(`${backend} ${JSON.stringify(fixture)}: each slot must occur once in stable depth order, got ${JSON.stringify(sorted)}`)
            }
        }
        const independentSizes = await page.evaluate(async () => {
            const r = window.renderer
            await r.compile(`search synth, render
solid().pointsEmit(stateSize: x64, layout: center)
  .pointsBillboardRender(viewMode: perspective, blendMode: alpha, density: 0)
  .pointsEmit(stateSize: x128, layout: center)
  .pointsBillboardRender(viewMode: perspective, blendMode: alpha, density: 0).write(o0)
render(o0)`)
            r.stop(); r.render(0)
            await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
            return r.pipeline.graph.passes.filter(pass => pass.effectFunc === 'pointsBillboardRender' &&
                pass.drawMode === 'billboards' && Array.isArray(pass.blend) && !r.pipeline.shouldSkipPass(pass)).map(pass => {
                const tex = r.pipeline.backend.textures.get(pass.inputs.orderTex)
                return [tex.width, tex.height]
            })
        })
        assert.deepEqual(independentSizes, [[64, 64], [128, 128]], 'sort storage must follow each source emitter independently')
        assert.deepEqual(errors, [], `${backend}: no browser or GPU errors`)
        console.log(`Checked ${backend}: near occlusion, translucent overlap, camera rotation, and unchanged additive/flat modes`)
        await page.close()
    }
    assert.deepEqual(failures, [], 'alpha billboards must be drawn from far to near in camera space')
    console.log('PASS: billboard camera-depth ordering and exact backend pixels')
} finally { await browser.close(); await releaseServer() }
