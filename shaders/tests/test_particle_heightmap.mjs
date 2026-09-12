#!/usr/bin/env node
// Real GPU contract: every state slot forms a grid, height and diffuse inputs
// remain independent, and perspective distance controls change rendered pixels.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effectsDir = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const artifactDir = process.env.PARTICLE_ARTIFACTS
if (artifactDir) fs.mkdirSync(artifactDir, { recursive: true })
const legacyOnly = process.argv.includes('--legacy')
const size = 256
const baseUrl = await acquireServer(0, root, effectsDir)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = new Map()
try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width: size, height: size } })
        const errors = []
        page.on('pageerror', e => errors.push(e.message))
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
        await page.goto(baseUrl)
        await page.setContent('<canvas id="c" width="256" height="256"></canvas>')
        await page.evaluate(async ({ baseUrl, backend, legacyOnly }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            const r = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 256, height: 256, basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            window.r = r
            await r.loadManifest()
            await r.loadEffects(['synth/solid', 'synth/perlin', 'synth/media', 'render/pointsEmit', 'render/pointsBillboardRender', ...(legacyOnly ? [] : ['points/heightmap'])])
            window.readState = async key => {
                const p = r.pipeline, b = p.backend
                const pass = p.graph.passes.find(pass => pass.effectFunc === 'heightmap')
                const id = p.surfaces.get(pass.outputs[key].slice(7)).read
                const tex = b.textures.get(id)
                const isFloat = tex.format === 'rgba32f' || tex.gpuFormat === 'rgba32float'
                let values
                if (b.gl) {
                    const gl = b.gl, old = gl.getParameter(gl.FRAMEBUFFER_BINDING)
                    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.handle, 0)
                    values = isFloat ? new Float32Array(tex.width * tex.height * 4) : new Uint8Array(tex.width * tex.height * 4)
                    gl.readPixels(0, 0, tex.width, tex.height, gl.RGBA, isFloat ? gl.FLOAT : gl.UNSIGNED_BYTE, values)
                    gl.bindFramebuffer(gl.FRAMEBUFFER, old); gl.deleteFramebuffer(fbo)
                } else {
                    const rowBytes = tex.width * (isFloat ? 16 : 4)
                    const stride = Math.ceil(rowBytes / 256) * 256
                    const buffer = b.device.createBuffer({ size: stride * tex.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
                    const encoder = b.device.createCommandEncoder()
                    encoder.copyTextureToBuffer({ texture: tex.handle }, { buffer, bytesPerRow: stride }, { width: tex.width, height: tex.height })
                    b.queue.submit([encoder.finish()]); await buffer.mapAsync(GPUMapMode.READ)
                    const raw = new Uint8Array(buffer.getMappedRange()), packed = new Uint8Array(rowBytes * tex.height)
                    for (let y = 0; y < tex.height; y++) packed.set(raw.subarray(y * stride, y * stride + rowBytes), y * rowBytes)
                    values = isFloat ? new Float32Array(packed.buffer) : packed
                    buffer.unmap(); buffer.destroy()
                }
                return { width: tex.width, height: tex.height, format: tex.format || tex.gpuFormat, values: Array.from(values) }
            }
            window.frame = async dsl => {
                await r.compile(dsl)
                r.stop()
                const media = r.pipeline.graph.passes.find(p => p.effectFunc === 'media')
                if (media) {
                    const source = document.createElement('canvas'); source.width = 64; source.height = 64
                    const ctx = source.getContext('2d')
                    if (window.opaqueSprite) { ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 64, 64) }
                    ctx.fillStyle = 'white'; ctx.fillRect(10, 0, 5, 64)
                    r.updateTextureFromSource('imageTex_step_' + media.stepIndex, source, { flipY: false })
                    r.applyStepParameterValues({ ['step_' + media.stepIndex]: { imageSize: [64, 64] } })
                }
                r.render(0)
                await r.pipeline.backend.waitForIdle?.()
                const p = r.pipeline
                const outputId = p.surfaces.get('o0').read
                const pixels = await p.backend.readPixels(outputId)
                return { backend: p.backend.getName().toLowerCase(), width: pixels.width, height: pixels.height, data: Array.from(pixels.data) }
            }
        }, { baseUrl, backend, legacyOnly })
        async function frame(name, dsl) {
            const result = await page.evaluate(dsl => window.frame(dsl), dsl)
            assert.equal(result.backend, backend, 'requested GPU backend must run')
            // Compare the presented canvas: internal WebGPU surfaces use a
            // different Y convention and are flipped during presentation.
            const data = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            if (artifactDir) {
                const png = new PNG({ width: result.width, height: result.height }); png.data = data
                fs.writeFileSync(path.join(artifactDir, `${backend}-${name}.png`), PNG.sync.write(png))
            }
            if (backend === 'webgl2') captures.set(name, data)
            else if (!name.startsWith('legacy-') && name !== 'source-emitter' && name !== 'source-height-pass') {
                const other = captures.get(name)
                let changed = 0, maximum = 0, faintEdgeChannels = 0
                const rotatedSprite = name.startsWith('texture-rotated-')
                const faintDefocus = ['texture-stripe-defocus', 'texture-opaque-defocus', 'texture-rotated-defocus'].includes(name)
                for (let i = 0; i < data.length; i++) {
                    const alphaIndex = i - i % 4 + 3
                    // Rotated quads can differ at partially covered boundary
                    // pixels. Compare their visible premultiplied contribution.
                    const a = rotatedSprite && i % 4 !== 3 ? Math.round(data[i] * data[alphaIndex] / 255) : data[i]
                    const b = rotatedSprite && i % 4 !== 3 ? Math.round(other[i] * other[alphaIndex] / 255) : other[i]
                    const d = Math.abs(a - b); if (!d) continue
                    if (!rotatedSprite && faintDefocus && data[alphaIndex] <= 1 && other[alphaIndex] <= 1) {
                        // Unpremultiplication can turn a 1/255-alpha fringe
                        // difference into RGB 0 vs 255. Its visible delta is 1.
                        faintEdgeChannels++
                        continue
                    }
                    changed++; maximum = Math.max(maximum, d)
                }
                // Bilinear reconstruction spreads a source edge across more
                // pixels; the visible difference remains at most 1/255.
                assert.ok(faintEdgeChannels <= 64, `${name}: excessive faint fringe differences (${faintEdgeChannels} channels)`)
                if (faintEdgeChannels) console.log(`${name}: ${faintEdgeChannels} channels differ only at alpha <= 1/255`)
                // Coverage at a handful of triangle edges can round differently
                // through float16 blending and canvas unpremultiplication. Core
                // fixtures are exact; rotated/noisy scenes allow only isolated
                // 8-bit edge rounding, never a shifted image or different noise.
                const edgeRounding = ['default-landscape', 'rotateY', 'rotateZ'].includes(name)
                // For a rotated soft sprite, permit one-LSB rounding in less
                // than 0.1% of the frame's channels across GPU drivers.
                const maxChannels = rotatedSprite ? (name.endsWith('sharp') ? 4 : Math.floor(data.length / 1000)) : edgeRounding ? 16 : 0
                const maxDelta = rotatedSprite ? (name.endsWith('sharp') ? 8 : 1) : edgeRounding ? 5 : 0
                assert.ok(changed <= maxChannels && maximum <= maxDelta,
                    `${name}: backend pixel mismatch (${changed} channels; max ${maximum})`)
                if (rotatedSprite && changed) console.log(`${name}: ${changed} premultiplied channels differ; max ${maximum}/255`)

            }
            return data
        }
        const legacy = mode => `search synth, render\nsolid(color: #6688cc).pointsEmit(stateSize: x64, layout: grid).pointsBillboardRender(viewMode: ${mode}, intensity: 0, inputIntensity: 0, density: 100).write(o0)\nrender(o0)`
        await frame('legacy-flat', legacy('flat'))
        await frame('legacy-ortho', legacy('ortho'))
        if (!legacyOnly) {
            assert.ok(fs.existsSync(path.join(effectsDir, 'points/heightmap/definition.js')), 'native heightmap behavior must be available')
            const stateDsl = (color = '#ff0000', height = 10, gridSize = 'x64') => `search synth, points, render
solid(color: ${color}).write(o1)
solid(color: #0000ff, alpha: 0.5).write(o2)
solid(color: #ffffff).pointsEmit(stateSize: ${gridSize}, layout: center, attrition: 10)
.heightmap(heightTex: read(o1), diffuseTex: read(o2), gridScale: 80, heightScale: ${height}, heightOffset: -2)
.pointsBillboardRender(viewMode: perspective, intensity: 0, inputIntensity: 0).write(o0)
render(o0)`
            await frame('state-red-height', stateDsl())
            const state = await page.evaluate(() => window.readState('outXYZ'))
            assert.equal(state.width, 64); assert.equal(state.height, 64)
            const xs = new Set(), zs = new Set()
            for (let i = 0; i < state.values.length; i += 4) {
                const [x, y, z, alive] = state.values.slice(i, i + 4)
                xs.add(x); zs.add(z)
                assert.ok(Math.abs(y - 0.126) < 0.00001, 'red luminance must set elevation independently of the diffuse surface')
                assert.equal(alive, 1, 'all slots must be alive despite center layout and attrition')
            }
            assert.equal(xs.size, 64); assert.equal(zs.size, 64)
            assert.equal(Math.min(...xs), -39.375); assert.equal(Math.max(...xs), 39.375)
            assert.equal(Math.min(...zs), -39.375); assert.equal(Math.max(...zs), 39.375)
            const rgba = await page.evaluate(() => window.readState('outRGBA'))
            for (let i = 0; i < rgba.values.length; i += 4) assert.deepEqual(rgba.values.slice(i, i + 4), [0, 0, 128, 128], 'diffuse blue and alpha must be retained')
            const velocity = await page.evaluate(() => window.readState('outVel'))
            for (let i = 0; i < velocity.values.length; i += 4) assert.deepEqual(velocity.values.slice(i, i + 3), [0, 0, 0], 'heightmap must clear particle motion')
            await page.evaluate(() => {
                const pass = window.r.pipeline.graph.passes.find(p => p.effectFunc === 'solid')
                window.r.applyStepParameterValues({ ['step_' + pass.stepIndex]: { color: [0, 1, 0] } })
                window.r.render(0.5)
            })
            const animated = await page.evaluate(() => window.readState('outXYZ'))
            assert.ok(Math.abs(animated.values[1] - 5.152) < 0.00001, 'height input must resample after a parameter update')
            await frame('negative-height', stateDsl('#ffffff', -10, 'x128'))
            const larger = await page.evaluate(() => window.readState('outXYZ'))
            assert.equal(larger.width * larger.height, 16384, 'particle count follows state size rather than canvas resolution')
            assert.ok(Math.abs(larger.values[1] + 12) < 0.00001, 'negative height scale must invert relief')
            const dsl = params => `search synth, points, render\nsolid(color: #ff0000).write(o1)\nsolid(color: #ffffff).pointsEmit(stateSize: x64).heightmap(heightScale: 20, diffuseTex: read(o1)).pointsBillboardRender(viewMode: perspective, rotateX: 0.6, posY: -10, intensity: 0, inputIntensity: 0, density: 100, pointSize: 3, ${params}).write(o0)\nrender(o0)`
            await frame('source-perlin', 'search synth\nperlin(scale: 22, octaves: 4, colorMode: mono).write(o0)\nrender(o0)')
            const beforeHeightmap = await frame('source-emitter', 'search synth, render\nperlin(scale: 22, octaves: 4, colorMode: mono).pointsEmit(stateSize: x64).write(o0)\nrender(o0)')
            const afterHeightmap = await frame('source-height-pass', 'search synth, points, render\nperlin(scale: 22, octaves: 4, colorMode: mono).pointsEmit(stateSize: x64).heightmap().write(o0)\nrender(o0)')
            assert.deepEqual(afterHeightmap, beforeHeightmap, 'heightmap must preserve the incoming asymmetric 2D surface')
            const { default: effect } = await import('../effects/points/heightmap/definition.js')
            await frame('default-landscape', effect.defaultProgram)
            const isolated = aperture => `search synth, points, render
solid(color: #ffffff).pointsEmit(stateSize: x64).heightmap(gridScale: 1, heightScale: 0)
.pointsBillboardRender(viewMode: perspective, rotateX: 0, density: 0.001, pointSize: 3, intensity: 0, inputIntensity: 0, aperture: ${aperture}, focalDistance: 20).write(o0)
render(o0)`
            const sharpPoint = await frame('isolated-sharp', isolated(0))
            const focusedPoint = await frame('isolated-focused', isolated(10).replace('focalDistance: 20', 'focalDistance: 80.4921875'))
            assert.deepEqual(focusedPoint, sharpPoint, 'particles on the focal plane must remain sharp at any aperture')
            const largeSharp = await frame('isolated-large-sharp', isolated(0).replace('pointSize: 3', 'pointSize: 64'))
            const partialFocus = await frame('isolated-partial-focus', isolated(17).replace('pointSize: 3', 'pointSize: 64'))
            const peak = data => Math.max(...data.filter((_, i) => i % 4 === 3))
            assert.ok(peak(partialFocus) <= peak(largeSharp) + 1, 'slight defocus must not boost peak opacity')
            const textureDsl = isolated(20).replace('pointSize: 3', 'pointSize: 16').replace('search synth, points, render', 'search synth, points, render\nmedia(bgAlpha: 0, scaleAmt: 400).write(o1)').replace('viewMode: perspective,', 'viewMode: perspective, shapeMode: texture, tex: read(o1),')
            const sharpTexture = await frame('texture-stripe-sharp', textureDsl.replace('aperture: 20', 'aperture: 0'))
            assert.ok(sharpTexture.some((v, i) => i % 4 === 3 && v > 0), 'texture fixture must be visible before defocus')
            await page.evaluate(async () => {
                const r = window.r
                const pass = r.pipeline.graph.passes.find(p => p.effectFunc === 'pointsBillboardRender')
                r.applyStepParameterValues({ ['step_' + pass.stepIndex]: { aperture: 20 } })
                r.render(0)
                await r.pipeline.backend.waitForIdle?.()
            })
            const liveTexture = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            assert.ok(liveTexture.some((v, i) => i % 4 === 3 && v > 0), 'enabling aperture live must preserve thin textured particles')
            assert.notDeepEqual(liveTexture, sharpTexture, 'live aperture control must change the sprite without recompiling')
            const softTexture = await frame('texture-stripe-defocus', textureDsl)
            assert.deepEqual(liveTexture, softTexture, 'live focus update must match a fresh compile')
            assert.ok(softTexture.some((v, i) => i % 4 === 3 && v > 0), 'defocus must retain texture content between integration sample sites')
            await page.evaluate(() => {
                const r = window.r
                const pass = r.pipeline.graph.passes.find(p => p.effectFunc === 'pointsBillboardRender')
                r.applyStepParameterValues({ ['step_' + pass.stepIndex]: { aperture: 0 } })
                r.render(0)
            })
            const refocused = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            assert.deepEqual(refocused, sharpTexture, 'turning off aperture must clear the coarse blur immediately')
            const centroid = (data, channel = 3) => {
                let mass = 0, x = 0, y = 0
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3] * (channel === 3 ? 1 : data[i + channel] / 255)
                    mass += alpha; x += (i / 4 % size) * alpha; y += Math.floor(i / 4 / size) * alpha
                }
                return [x / mass, y / mass]
            }
            const sharpCenter = centroid(sharpTexture), softCenter = centroid(softTexture)
            assert.ok(Math.hypot(softCenter[0] - sharpCenter[0], softCenter[1] - sharpCenter[1]) < 0.75,
                `defocus must preserve off-center sprite location: ${sharpCenter} -> ${softCenter}`)
            await page.evaluate(() => { window.opaqueSprite = true })
            const opaqueSharp = await frame('texture-opaque-sharp', textureDsl.replace('aperture: 20', 'aperture: 0'))
            const opaqueSoft = await frame('texture-opaque-defocus', textureDsl)
            await page.evaluate(() => { window.opaqueSprite = false })
            for (const channel of [0, 3]) {
                const a = centroid(opaqueSharp, channel), b = centroid(opaqueSoft, channel)
                assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.75,
                    `defocus must retain opaque sprite channel ${channel} location: ${a} -> ${b}`)
            }
            const rotatedDsl = textureDsl.replace('pointSize: 16', 'pointSize: 32, rotationVar: 100')
            const rotatedSharp = centroid(await frame('texture-rotated-sharp', rotatedDsl.replace('aperture: 20', 'aperture: 0')))
            const rotatedSoft = centroid(await frame('texture-rotated-defocus', rotatedDsl))
            assert.ok(Math.hypot(rotatedSharp[0] - rotatedSoft[0], rotatedSharp[1] - rotatedSoft[1]) < 0.75,
                'defocus must retain source location after sprite rotation')
            const triangleDsl = isolated(20).replace('pointSize: 3', 'pointSize: 32, shapeMode: triangle')
            const triangleSharp = centroid(await frame('triangle-sharp', triangleDsl.replace('aperture: 20', 'aperture: 0')))
            const triangleSoft = centroid(await frame('triangle-defocus', triangleDsl))
            assert.ok(Math.hypot(triangleSharp[0] - triangleSoft[0], triangleSharp[1] - triangleSoft[1]) < 0.75,
                'defocus must retain the procedural triangle center')
            const softPoint = await frame('isolated-defocus', isolated(10))
            const active = new Set()
            for (let i = 0; i < softPoint.length; i += 4) if (softPoint[i] > 0) active.add(i / 4)
            let components = 0
            while (active.size) {
                components++
                const queue = [active.values().next().value]; active.delete(queue[0])
                for (let i = 0; i < queue.length; i++) {
                    const pixel = queue[i], x = pixel % size, y = Math.floor(pixel / size)
                    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const nx = x + dx, ny = y + dy, next = ny * size + nx
                        if (nx >= 0 && nx < size && ny >= 0 && ny < size && active.delete(next)) queue.push(next)
                    }
                }
            }
            assert.equal(components, 1, 'defocus must remain one continuous soft particle rather than separated sprite copies')
            const trailStart = await frame('defocus-trail', isolated(20)
                .replace('pointSize: 3', 'pointSize: 16, depositOpacity: 100')
                .replace('intensity: 0,', 'intensity: 50,'))
            const alphaMass = data => data.reduce((total, value, index) => total + (index % 4 === 3 ? value : 0), 0)
            let previousMass = alphaMass(trailStart)
            assert.ok(previousMass > 1000, 'the defocused trail fixture must carry visible energy')
            for (let frameIndex = 0; frameIndex < 2; frameIndex++) {
                await page.evaluate(() => {
                    const r = window.r
                    const pass = r.pipeline.graph.passes.find(p => p.effectFunc === 'pointsBillboardRender')
                    r.applyStepParameterValues({ ['step_' + pass.stepIndex]: { posZ: 200 } })
                    r.render(0)
                })
                const fadedTrail = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
                const mass = alphaMass(fadedTrail)
                assert.ok(mass / previousMass > 0.45 && mass / previousMass < 0.55,
                    'coarse blur must decay once per frame without stale scratch or lost trail history')
                previousMass = mass
            }
            const near = await frame('landscape', dsl('aperture: 0'))
            assert.ok(near.some((v, i) => i % 4 === 0 && v > 10), 'landscape must render red diffuse particles')
            assert.ok(near.every((v, i) => i % 4 === 0 || i % 4 === 3 || v === 0), 'white height input must not replace red diffuse color')
            const hidden = await frame('size-cutoff', dsl('sizeDistance: 1'))
            assert.ok(hidden.every(v => v === 0), 'particles past size cutoff must disappear')
            const dark = await frame('brightness-cutoff', dsl('brightnessDistance: 1'))
            assert.ok(dark.every(v => v === 0), 'particles past brightness cutoff must disappear in RGB and alpha')
            const blurred = await frame('defocus', dsl('aperture: 10, focalDistance: 20'))
            assert.notDeepEqual(blurred, near, 'aperture and focal distance must change the image')
            const faded = await frame('brightness-fade', dsl('brightnessDistance: 150'))
            const energy = data => data.reduce((sum, v, i) => sum + (i % 4 === 0 ? v : 0), 0)
            assert.ok(energy(faded) > 0 && energy(faded) < energy(near), 'brightness must fade gradually before cutoff')
            const smaller = await frame('size-fade', dsl('sizeDistance: 150'))
            assert.ok(energy(smaller) > 0 && energy(smaller) < energy(near), 'size must fall gradually before cutoff')
            const wide = await frame('wide-fov', dsl('fieldOfView: 110'))
            assert.notDeepEqual(wide, near, 'field of view must change the projection')
            for (const axis of ['rotateX', 'rotateY', 'rotateZ', 'posX', 'posY']) {
                const changedDsl = axis === 'rotateX' ? dsl('aperture: 0').replace('rotateX: 0.6', 'rotateX: 1.0')
                    : axis === 'posY' ? dsl('aperture: 0').replace('posY: -10', 'posY: -20') : dsl(`${axis}: 0.7`)
                assert.notDeepEqual(await frame(axis, changedDsl), near, `${axis} must change the camera view`)
            }
            const moved = await frame('z-flight', dsl('posZ: 25'))
            assert.notDeepEqual(moved, near, 'Z offset must change perspective')
            const clipped = await frame('behind-camera', dsl('posZ: 200'))
            assert.ok(clipped.every(v => v === 0), 'particles behind the camera must be clipped')
        }
        assert.deepEqual(errors, [], `${backend}: no browser or shader errors`)
        console.log(`PASS ${backend}: ${legacyOnly ? 'legacy capture' : 'heightmap and distance controls'}`)
        await page.close()
    }
} finally { await browser.close(); await releaseServer() }
