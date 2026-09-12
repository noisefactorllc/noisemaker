import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = process.env.PARTICLE_ACCEPTANCE_ARTIFACTS
if (artifacts) fs.mkdirSync(artifacts, { recursive: true })
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const size = 256, captures = new Map(), results = [], findings = []
const stats = (pixels, channel = 3) => {
    let mass = 0, x = 0, y = 0, count = 0, left = size, right = -1, top = size, bottom = -1
    for (let i = 0; i < pixels.length; i += 4) {
        const weight = pixels[i + 3] * (channel === 3 ? 1 : pixels[i + channel] / 255)
        const px = i / 4 % size, py = Math.floor(i / 4 / size)
        mass += weight; x += px * weight; y += py * weight
        if (weight > 0) { count++; left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py) }
    }
    return { mass, x: x / mass, y: y / mass, count, left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 }
}
const camera = { viewMode: 2, rotateX: 0, rotateY: 0, rotateZ: 0, viewScale: 1, posX: 0, posY: 0, posZ: 0, fieldOfView: 90 }
const center = [[0, 0, 0, 1, 1, 1, 1]]
const overlap = [[0, 0, 20, 1, 0, 0, 1], [0, 0, -20, 0, 0, 1, 1]]
function projection(position, c) {
    let [x, y, z] = position
    ;[y, z] = [y * Math.cos(c.rotateX) - z * Math.sin(c.rotateX), y * Math.sin(c.rotateX) + z * Math.cos(c.rotateX)]
    ;[x, z] = [x * Math.cos(c.rotateY) + z * Math.sin(c.rotateY), -x * Math.sin(c.rotateY) + z * Math.cos(c.rotateY)]
    ;[x, y] = [x * Math.cos(c.rotateZ) - y * Math.sin(c.rotateZ), x * Math.sin(c.rotateZ) + y * Math.cos(c.rotateZ)]
    const scale = size / 2 / Math.tan(c.fieldOfView * Math.PI / 360) * c.viewScale / (80 - z - c.posZ)
    return [size / 2 + (x + c.posX) * scale, size / 2 - (y + c.posY) * scale]
}
try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
        const errors = []
        page.on('pageerror', e => errors.push(e.message))
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
        await page.goto(baseUrl)
        await page.setContent('<canvas id="actual" width="256" height="256"></canvas><canvas id="reference" width="256" height="256"></canvas>')
        await page.evaluate(async ({ baseUrl, backend, size }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            window.renderers = []
            window.gpuErrors = []
            window.seenDevices = new WeakSet()
            for (const id of ['actual', 'reference']) {
                const canvas = document.getElementById(id)
                canvas.addEventListener('webglcontextlost', () => gpuErrors.push('WebGL context lost'))
                const r = new CanvasRenderer({ canvas, width: size, height: size, basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                await r.loadManifest()
                await r.loadEffects(['synth/solid', 'synth/media', 'render/pointsEmit', 'render/pointsRender', 'render/pointsBillboardRender', 'points/heightGrid'])
                renderers.push(r)
            }
            window.watch = r => {
                const b = r.pipeline.backend
                if (b.device && !seenDevices.has(b.device)) {
                    seenDevices.add(b.device)
                    b.device.addEventListener('uncapturederror', e => gpuErrors.push(e.error.message))
                    b.device.lost.then(info => { if (info.reason !== 'destroyed') gpuErrors.push(`Device lost: ${info.message}`) })
                }
            }
            window.fixtureFrame = async ({ which, renderer, params, fixture, compile, sprite, time }) => {
                const r = renderers[which]
                if (compile) {
                    const defaults = { density: 100, intensity: 0, inputIntensity: 0, ...params }
                    const common = Object.entries(defaults).map(([k, v]) => `${k}: ${v}`).join(', ')
                    const specific = renderer === 'pointsRender' ? 'matteOpacity: 0' : 'pointSize: 16, shapeMode: square, depositOpacity: 100, tex: read(o2)'
                    const omit = renderer === 'pointsRender' ? [] : ['pointSize', 'shapeMode', 'depositOpacity']
                    const extra = specific.split(', ').filter(entry => !omit.some(k => k in defaults && entry.startsWith(k + ':'))).join(', ')
                    await r.compile(`search synth, render\n${sprite ? 'media(bgAlpha: 0, scaleAmt: 400).write(o2)\n' : ''}solid(color: #204080).pointsEmit(stateSize: x64).${renderer}(${extra}, ${common}).write(o0)\nrender(o0)`)
                    r.stop(); watch(r)
                } else {
                    const step = r.pipeline.graph.passes.find(p => p.effectFunc === renderer).stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: params })
                }
                const b = r.pipeline.backend
                const xyz = new Float32Array(64 * 64 * 4), rgba = new Float32Array(xyz.length)
                fixture.forEach((p, i) => { xyz.set([...p.slice(0, 3), 1], i * 4); rgba.set(p.slice(3), i * 4) })
                b.uploadDataTexture('acceptance_xyz', xyz, 64, 64)
                b.uploadDataTexture('acceptance_rgba', rgba, 64, 64)
                for (const pass of r.pipeline.graph.passes) if (pass.effectFunc === renderer) {
                    if (pass.inputs.xyzTex) pass.inputs.xyzTex = 'acceptance_xyz'
                    if (pass.inputs.rgbaTex) pass.inputs.rgbaTex = 'acceptance_rgba'
                }
                if (sprite) {
                    const media = r.pipeline.graph.passes.find(p => p.effectFunc === 'media')
                    const src = document.createElement('canvas'); src.width = 64; src.height = 64
                    const ctx = src.getContext('2d')
                    if (sprite === 'hole') {
                        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 64, 64); ctx.clearRect(24, 24, 16, 16)
                    } else {
                        ctx.fillStyle = 'rgba(255,0,0,0.8)'; ctx.fillRect(6, 10, 10, 18)
                        ctx.fillStyle = 'rgba(0,255,0,0.6)'; ctx.fillRect(26, 32, 12, 12)
                        ctx.fillStyle = 'rgba(0,0,255,1)'; ctx.fillRect(46, 12, 10, 20)
                    }
                    r.updateTextureFromSource('imageTex_step_' + media.stepIndex, src, { flipY: false })
                    r.applyStepParameterValues({ ['step_' + media.stepIndex]: { imageSize: [64, 64] } })
                }
                r.render(time)
                await b.device?.queue.onSubmittedWorkDone()
                if (b.gl && (b.gl.isContextLost() || b.gl.getError() !== b.gl.NO_ERROR)) gpuErrors.push('WebGL error')
                return b.getName().toLowerCase()
            }
        }, { baseUrl, backend, size })
        async function capture(name, params, fixture = center, { renderer = 'pointsBillboardRender', compile = true, which = 0, sprite = null, time = 0, parity = true } = {}) {
            assert.equal(await page.evaluate(options => fixtureFrame(options), { renderer, params, fixture, compile, which, sprite, time }), backend)
            const png = await page.locator(which ? '#reference' : '#actual').screenshot({ omitBackground: true })
            const pixels = PNG.sync.read(png).data
            if (artifacts && which === 0) fs.writeFileSync(path.join(artifacts, `${backend}-${name}.png`), png)
            if (parity && which === 0) {
                if (backend === 'webgl2') captures.set(name, pixels)
                else if (!pixels.equals(captures.get(name))) {
                    const other = captures.get(name)
                    let channels = 0, maximum = 0
                    for (let i = 0; i < pixels.length; i++) if (pixels[i] !== other[i]) { channels++; maximum = Math.max(maximum, Math.abs(pixels[i] - other[i])) }
                    findings.push({ backend, case: name, issue: 'backend-pixel-parity', channels, maximum })
                }
            }
            return pixels
        }
        // Billboard center geometry is derived independently, not from pointsRender.
        const particle = [[-12, 8, -10, 1, 1, 1, 1]]
        for (const [name, change] of Object.entries({ baseline: {}, rotateX: { rotateX: 0.4 }, rotateY: { rotateY: 0.4 }, rotateZ: { rotateZ: 0.4 },
            posX: { posX: 10 }, posY: { posY: -5 }, posZ: { posZ: 20 }, zoom: { viewScale: 1.4 }, fov: { fieldOfView: 60 } })) {
            const params = { ...camera, ...change, pointSize: 8 }
            const pixels = await capture(`camera-${name}`, params, particle, { parity: false })
            const actual = stats(pixels), [x, y] = projection(particle[0], params)
            assert.ok(actual.count > 0 && Math.abs(actual.x + 0.5 - x) <= 1 && Math.abs(actual.y + 0.5 - y) <= 1,
                `${backend} ${name}: expected center ${x},${y}; got ${actual.x + 0.5},${actual.y + 0.5}`)
        }
        for (const [name, posZ, visible] of [['in-front', 79.8, true], ['clipped', 79.95, false], ['behind', 81, false]]) {
            const pixels = await capture(`billboard-near-${name}`, { ...camera, posZ, pointSize: 1 }, center)
            assert.equal(stats(pixels).count > 0, visible)
        }
        // Near textured red covers blue except where its central hole is transparent.
        // A smaller far sprite puts its opaque region behind the near hole.
        const hole = await capture('texture-hole', { ...camera, blendMode: 1, shapeMode: 0, pointSize: 64 },
            [[0, 0, 20, 1, 0, 0, 1], [5, 0, -20, 0, 0, 1, 1]], { sprite: 'hole' })
        const sample = (pixels, x, y) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)]
        assert.deepEqual(sample(hole, 124, 128), [0, 0, 255, 255], 'sprite hole must expose rear blue')
        assert.deepEqual(sample(hole, 143, 128), [255, 0, 0, 255], 'opaque foreground must cover rear blue')
        const textured = { ...camera, pointSize: 48, shapeMode: 0, focalDistance: 20 }
        const sharp = await capture('multicolor-sharp', { ...textured, aperture: 0 }, center, { sprite: 'colors' })
        const soft = await capture('multicolor-defocus', { ...textured, aperture: 12 }, center, { sprite: 'colors', parity: false })
        for (const channel of [0, 1, 2]) {
            const a = stats(sharp, channel), b = stats(soft, channel)
            assert.ok(a.mass > 100 && b.mass > 100)
            assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1, `${backend}: channel ${channel} centroid moved`)
            if (!(b.mass / a.mass > 0.7 && b.mass / a.mass < 1.3)) findings.push({ backend, case: "multicolor-defocus-energy", channel, ratio: b.mass / a.mass })
        }
        assert.ok(stats(soft).width > stats(sharp).width && stats(soft).height > stats(sharp).height)
        assert.deepEqual(sample(soft, 0, 0), [0, 0, 0, 0])
        // Focus moves between two isolated depths; on-plane output stays sharp.
        for (const z of [-20, 20]) {
            const fixture = [[0, 0, z, 1, 1, 1, 1]]
            const a = await capture(`focus-${z}-sharp`, { ...camera, pointSize: 12, aperture: 0 }, fixture)
            const b = await capture(`focus-${z}-plane`, { ...camera, pointSize: 12, aperture: 20, focalDistance: 80 - z }, fixture)
            assert.deepEqual(a, b, 'correct focus depth must retain sharp particles')
            const c = await capture(`focus-${z}-away`, { ...camera, pointSize: 12, aperture: 20, focalDistance: z === 20 ? 100 : 60 }, fixture)
            assert.ok(stats(c).count > stats(a).count)
        }
        // Sample the whole aperture range and both sides of the sharp/coarse
        // handoff. One-pixel boundary quantization is allowed for spread.
        const focusParams = { ...camera, pointSize: 8, shapeMode: 1, focalDistance: 20 }
        let previousWidth = 0
        for (const aperture of [0, 0.1, 1, 2, 4, 6, 8, 10, 12, 16, 20]) {
            const pixels = await capture(`aperture-sweep-${aperture}`, { ...focusParams, aperture }, center, { parity: false })
            const s = stats(pixels)
            assert.ok(s.mass > 0 && Math.abs(s.x - 127.5) < 1 && Math.abs(s.y - 127.5) < 1)
            assert.ok(s.width + 2 >= previousWidth, 'increasing aperture must not shrink the footprint beyond raster quantization')
            previousWidth = s.width
        }
        for (const boundary of [0, 8 / Math.sqrt(3) / 1.5, 3.854, 4 / 0.75, 8 / Math.sqrt(3) / 0.75, 8 / 0.75]) {
            const before = await capture(`aperture-boundary-${boundary}-before`, { ...focusParams, aperture: Math.max(0, boundary - 0.001) }, center, { parity: false })
            const after = await capture(`aperture-boundary-${boundary}-after`, { ...focusParams, aperture: boundary + 0.001 }, center, { compile: false, parity: false })
            let delta = 0
            for (let i = 3; i < before.length; i += 4) delta += Math.abs(before[i] - after[i])
            assert.ok(delta / stats(before).mass < 0.02, 'a 0.002 aperture step must not cause a visible coverage jump')
        }
        for (const control of ['sizeDistance', 'brightnessDistance']) {
            const base = await capture(`${control}-disabled`, { ...camera, pointSize: 32, [control]: 0 })
            let previous = Infinity
            for (const distance of [500, 240, 160, 100, 80, 40]) {
                const pixels = await capture(`${control}-${distance}`, { ...camera, pointSize: 32, [control]: distance }, center, { compile: false })
                const value = control === 'sizeDistance' ? stats(pixels).count : stats(pixels).mass
                assert.ok(value <= previous, `${control}: fade must be monotonic`)
                if (distance <= 80) assert.equal(value, 0, `${control}: cutoff is at camera distance80`)
                else assert.ok(value > 0)
                previous = value
            }
            assert.deepEqual(await capture(`${control}-restored`, { ...camera, pointSize: 32, [control]: 0 }, center, { compile: false }), base)
        }
        // Preserve buffers in the live renderer and compare against a clean reference.
        for (const renderer of ['pointsRender', 'pointsBillboardRender']) {
            const fixture = [[0.35, 0.45, 10, 1, 0, 0, 1], [0.65, 0.55, -10, 0, 0, 1, 1]]
            let first = true
            for (let cycle = 0; cycle < 3; cycle++) for (const viewMode of [0, 1, 2, 0]) {
                const params = { ...camera, viewMode }
                const live = await capture(`${renderer}-cycle-${cycle}-${viewMode}`, params, fixture, { renderer, compile: first })
                first = false
                const reference = await capture('reference', params, fixture, { renderer, which: 1 })
                assert.deepEqual(live, reference, 'live view must equal a fresh render')
            }
        }
        let first = true
        for (const [index, mode] of [
            { viewMode: 2, blendMode: 0, aperture: 20, shapeMode: 0, rotateY: 0.3 },
            { viewMode: 2, blendMode: 1, aperture: 20, shapeMode: 0, rotateY: 0.6 },
            { viewMode: 0, blendMode: 1, aperture: 20, shapeMode: 0, rotateY: 0.6 },
            { viewMode: 1, blendMode: 0, aperture: 20, shapeMode: 3, rotateY: 0.3 },
            { viewMode: 2, blendMode: 0, aperture: 0, shapeMode: 0, rotateY: 0 },
            { viewMode: 2, blendMode: 1, aperture: 20, shapeMode: 3, rotateY: 0 },
            { viewMode: 2, blendMode: 0, aperture: 20, shapeMode: 0, rotateY: 0.3 }
        ].entries()) {
            const params = { ...camera, focalDistance: 1, pointSize: 24, ...mode }
            const live = await capture(`transition-${index}`, params, [[0.5, 0.5, 0, 1, 1, 1, 1]], { compile: first, sprite: 'colors', parity: false })
            first = false
            const fresh = await capture('reference', params, [[0.5, 0.5, 0, 1, 1, 1, 1]], { which: 1, sprite: 'colors' })
            assert.deepEqual(live, fresh, `${backend}: mode transition retained stale data`)
        }
        // Compare actual automation output against independently compiled static
        // values, including perspective and both sides of each binary control.
        for (const renderer of ['pointsRender', 'pointsBillboardRender']) {
            // Oscillator bounds are normalized 0..1; the view consumer needs
            // to expose the full 0..2 choice range to reach perspective.
            const cases = [{ key: 'viewMode', expr: 'osc(type: oscKind.saw)', samples: [[0.1, 0], [0.4, 1], [0.9, 2]] }]
            if (renderer === 'pointsBillboardRender') for (const [key, max] of [['blendMode', 1], ['aperture', 20], ['shapeMode', 7]]) {
                cases.push({ key, expr: 'osc(type: oscKind.square)', samples: [[0.25, 0], [0.75, max], [0.25, 0]] })
            }
            for (const { key, expr, samples } of cases) {
                const params = { ...camera, ...(renderer === 'pointsBillboardRender' ? { focalDistance: 1, pointSize: 24, shapeMode: 0, aperture: 20 } : {}) }
                let first = true
                for (const [time, value] of samples) {
                    const fixture = [[0.35, 0.45, 0, 1, 1, 1, 1]], sprite = renderer === 'pointsBillboardRender' ? 'colors' : null
                    const live = await capture(`automation-${renderer}-${key}-${time}`, first ? { ...params, [key]: expr } : {}, fixture,
                        { renderer, compile: first, sprite, time, parity: false })
                    first = false
                    const fresh = await capture('reference', { ...params, [key]: value }, fixture, { renderer, sprite, time, which: 1 })
                    if (!live.equals(fresh)) {
                        const resolved = await page.evaluate(({ key, renderer, time }) => {
                            const p = renderers[0].pipeline, pass = p.graph.passes.find(pass => pass.effectFunc === renderer && pass.uniforms?.[key] !== undefined)
                            return p.resolveUniformValue(pass.uniforms[key], time, pass.uniformSpecs?.[key])
                        }, { key, renderer, time })
                        findings.push({ backend, case: 'automation-static-equivalence', renderer, key, time, expected: value, resolved })
                    }
                }
            }
        }
        // Input/background endpoints have analytical colors independent of renderer code.
        for (const renderer of ['pointsRender', 'pointsBillboardRender']) {
            const params = { ...camera, inputIntensity: 100 }
            if (renderer === 'pointsRender') {
                // Use the public matte control after compiling the usual transparent fixture.
                await capture('matte-initial', params, center, { renderer })
                await page.evaluate(() => {
                    const r = renderers[0], step = r.pipeline.graph.passes.find(p => p.effectFunc === 'pointsRender').stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: { matteOpacity: 1 } }); r.render(0)
                })
                const pixels = PNG.sync.read(await page.locator('#actual').screenshot({ omitBackground: true })).data
                assert.deepEqual(sample(pixels, 10, 10), [32, 64, 128, 255])
                await page.evaluate(() => {
                    const r = renderers[0], step = r.pipeline.graph.passes.find(p => p.effectFunc === 'pointsRender').stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: { matteOpacity: 0 } }); r.render(0)
                })
                const clear = PNG.sync.read(await page.locator('#actual').screenshot({ omitBackground: true })).data
                assert.deepEqual(sample(clear, 10, 10), [0, 0, 0, 0])
            } else for (const blendMode of [0, 1]) {
                const pixels = await capture(`input-${blendMode}`, { ...params, blendMode }, center)
                assert.deepEqual(sample(pixels, 10, 10), [32, 64, 128, 255])
                const clear = await capture(`input-off-${blendMode}`, { ...params, blendMode, inputIntensity: 0 }, center, { compile: false })
                assert.deepEqual(sample(clear, 10, 10), [0, 0, 0, 0])
            }
        }
        // Red at half opacity over #204080: alpha OVER attenuates every
        // background channel; additive screen retains the green/blue channels.
        for (const [blendMode, expected] of [[1, [144, 32, 64, 255]], [0, [144, 64, 128, 255]]]) {
            const pixels = await capture(`foreground-over-input-${blendMode}`, { ...camera, blendMode, depositOpacity: 50, inputIntensity: 100 },
                [[0, 0, 0, 1, 0, 0, 1]])
            const actual = sample(pixels, 128, 128)
            assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= 1), `foreground/input composite: expected ${expected}, got ${actual}`)
        }
        // Native grid placement permits counting actual occupied pixels after resize.
        for (const renderer of ['pointsRender', 'pointsBillboardRender']) {
            const counts = await page.evaluate(async renderer => {
                const r = renderers[0]
                r.resize(renderer === 'pointsRender' ? 256 : 512, renderer === 'pointsRender' ? 256 : 512)
                const specific = renderer === 'pointsRender' ? 'matteOpacity: 0' : 'pointSize: 2, shapeMode: square, depositOpacity: 100, blendMode: alpha'
                await r.compile(`search synth, render\nsolid(color: #ffffff).pointsEmit(stateSize: x64, layout: grid, resetState: true).${renderer}(viewMode: flat, density: 100, intensity: 0, inputIntensity: 0, ${specific}).write(o0)\nrender(o0)`)
                r.stop(); watch(r)
                const step = r.pipeline.graph.passes.find(p => p.effectFunc === 'pointsEmit').stepIndex
                const out = [], freshMatches = [], differences = []
                const reference = renderers[1]
                // Canvas presentation dimensions update on render; use the
                // explicit target size before the live renderer's first frame.
                reference.resize(renderer === 'pointsRender' ? 256 : 512, renderer === 'pointsRender' ? 256 : 512)
                for (const size of [64, 128, 256, 64]) {
                    r.applyStepParameterValues({ [`step_${step}`]: { stateSize: size } }); r.render(0)
                    await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    const pixels = await r.pipeline.backend.readPixels(r.pipeline.surfaces.get('o0').read)
                    out.push([...pixels.data].filter((v, i) => i % 4 === 3 && v > 0).length)
                    await reference.compile(`search synth, render\nsolid(color: #ffffff).pointsEmit(stateSize: x${size}, layout: grid, resetState: true).${renderer}(viewMode: flat, density: 100, intensity: 0, inputIntensity: 0, ${specific}).write(o0)\nrender(o0)`)
                    reference.stop(); watch(reference); reference.render(0)
                    const fresh = await reference.pipeline.backend.readPixels(reference.pipeline.surfaces.get('o0').read)
                    freshMatches.push(pixels.data.length === fresh.data.length && pixels.data.every((v, i) => v === fresh.data[i]))
                    const examples = []
                    let channels = 0
                    for (let i = 0; i < pixels.data.length; i++) if (pixels.data[i] !== fresh.data[i]) {
                        channels++
                        if (examples.length < 8) examples.push([i, pixels.data[i], fresh.data[i]])
                    }
                    differences.push({ size, liveDimensions: [pixels.width, pixels.height], freshDimensions: [fresh.width, fresh.height], channels, examples })
                }
                return { out, freshMatches, differences }
            }, renderer)
            assert.deepEqual(counts.out, renderer === 'pointsRender' ? [4096, 16384, 65536, 4096] : [16384, 65536, 262144, 16384], `${backend} ${renderer}: visible count must follow live emitter size`)
            for (let i = 0; i < counts.freshMatches.length; i++) if (!counts.freshMatches[i]) {
                findings.push({ backend, case: 'resize-fresh-equivalence', renderer, ...counts.differences[i] })
            }
        }
        const isolated = await page.evaluate(async () => {
            const r = renderers[0]; r.resize(256, 256)
            await r.compile(`search synth, render
solid(color: #ff0000).pointsEmit(stateSize: x64, layout: grid, resetState: true)
 .pointsBillboardRender(viewMode: ortho, rotateX: 0.4, blendMode: alpha, density: 100, pointSize: 2, intensity: 0, inputIntensity: 0).write(o0)
solid(color: #0000ff).pointsEmit(stateSize: x128, layout: grid, resetState: true)
 .pointsBillboardRender(viewMode: perspective, posX: 10, blendMode: additive, density: 100, pointSize: 2, intensity: 0, inputIntensity: 0).write(o1)
render(o0)`)
            r.stop(); watch(r); r.render(0)
            const p = r.pipeline, b = p.backend
            const otherStep = p.graph.passes.filter(pass => pass.effectFunc === 'pointsBillboardRender').at(-1).stepIndex
            const textureIds = [...new Set(p.graph.passes.filter(pass => pass.stepIndex === otherStep).flatMap(pass => Object.values(pass.inputs)))]
                .filter(id => b.textures.has(id))
            const dimensions = () => textureIds.map(id => [id, b.textures.get(id).width, b.textures.get(id).height])
            const sizesBefore = dimensions()
            const image = async name => Array.from((await b.readPixels(p.surfaces.get(name).read)).data)
            const before = await image('o1'), original = await image('o0')
            const emitter = p.graph.passes.find(pass => pass.effectFunc === 'pointsEmit').stepIndex
            const renderer = p.graph.passes.find(pass => pass.effectFunc === 'pointsBillboardRender').stepIndex
            r.applyStepParameterValues({ [`step_${emitter}`]: { stateSize: 128 }, [`step_${renderer}`]: { posX: 12, rotateY: 0.8, blendMode: 0 } })
            r.render(0)
            const after = await image('o1'), changed = await image('o0')
            return { before, after, original, changed, sizesBefore, sizesAfter: dimensions() }
        })
        assert.ok(isolated.before.some(v => v > 0) && isolated.original.some(v => v > 0))
        assert.deepEqual(isolated.after, isolated.before, 'another emitter camera/blend/count update must not affect this instance')
        assert.notDeepEqual(isolated.changed, isolated.original, 'targeted instance must actually change')
        assert.ok(isolated.sizesBefore.length > 0)
        assert.deepEqual(isolated.sizesAfter, isolated.sizesBefore, 'other instance texture dimensions must remain unchanged')
        // Compile rejection is tested through the language API without emitting
        // expected browser console errors into the positive rendering checks.
        const names = await page.evaluate(async baseUrl => {
            const { lex } = await import(`${baseUrl}/shaders/src/lang/lexer.js`)
            const { parse } = await import(`${baseUrl}/shaders/src/lang/parser.js`)
            const { validate } = await import(`${baseUrl}/shaders/src/lang/validator.js`)
            const { getEffect } = await import(`${baseUrl}/shaders/src/runtime/registry.js`)
            const manifest = await (await fetch(`${baseUrl}/shaders/effects/manifest.json`)).json()
            const program = name => validate(parse(lex(`search synth, points, render\nsolid().pointsEmit().${name}().pointsRender().write(o0)\nrender(o0)`)))
            return { current: program('heightGrid').diagnostics, old: program('heightmap').diagnostics,
                func: getEffect('points/heightGrid')?.func, oldRegistered: !!getEffect('points/heightmap'), manifest: JSON.stringify(manifest) }
        }, baseUrl)
        assert.deepEqual(names.current, [])
        assert.ok(names.old.length > 0 && JSON.stringify(names.old).includes('heightmap'), 'old DSL effect must be rejected')
        assert.equal(names.func, 'heightGrid'); assert.equal(names.oldRegistered, false)
        assert.ok(names.manifest.includes('points/heightGrid') && !names.manifest.includes('points/heightmap'))
        assert.deepEqual(await page.evaluate(() => gpuErrors), [])
        assert.deepEqual(errors, [], `${backend}: no browser or GPU errors`)
        results.push({ backend, status: findings.some(f => f.backend === backend) ? 'findings' : 'pass' })
        console.log(`CHECKED ${backend}: independent billboard camera, holes, multicolor focus, live equivalence, fades, compositing and visible resize counts`)
        await page.close()
    }
    assert.deepEqual(findings, [], "acceptance findings")
} finally {
    if (artifacts) fs.writeFileSync(path.join(artifacts, "findings.json"), JSON.stringify(findings, null, 2))
    if (artifacts) fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2))
    await browser.close(); await releaseServer()
}
