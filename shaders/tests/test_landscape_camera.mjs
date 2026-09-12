import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import landscape from '../effects/render/renderLandscape3d/definition.js'
import billboard from '../effects/render/pointsBillboardRender/definition.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const recordLegacy = process.argv.includes('--record-legacy')
const artifacts = process.env.LANDSCAPE_CAMERA_ARTIFACTS
if (artifacts) fs.mkdirSync(artifacts, { recursive: true })
const cameraKeys = ['rotateX', 'rotateY', 'rotateZ', 'viewScale', 'posX', 'posY', 'posZ', 'fieldOfView']
if (!recordLegacy) {
    for (const key of cameraKeys) {
        for (const field of ['type', 'default', 'min', 'max', 'step', 'uniform']) {
            assert.equal(landscape.globals[key]?.[field], billboard.globals[key][field], `${key}.${field} must match billboard controls`)
        }
    }
    assert.deepEqual(landscape.globals.viewMode.choices, { ortho: 1, perspective: 2 })
    assert.equal(landscape.globals.viewMode.default, 1, 'existing programs must remain orthographic')
    assert.deepEqual(Object.keys(landscape.globals).slice(0, 13), ['volumeSize', 'threshold', 'densitySource', 'zoom', 'panX', 'panY',
        'lightDirection', 'ambient', 'diffuseIntensity', 'specularIntensity', 'bgColor', 'bgAlpha', 'viewMode'])
}
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const width = 160, height = 128
const legacyHashes = JSON.parse(fs.readFileSync(new URL('./fixtures/landscape-legacy-hashes.json', import.meta.url), 'utf8'))
const baseline = {}, captures = new Map()
const controls = Object.fromEntries(cameraKeys.map(key => [key, billboard.globals[key].default]))

function bounds(pixels) {
    let left = width, right = -1, top = height, bottom = -1, count = 0
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3] === 0) continue
        left = Math.min(left, x); right = Math.max(right, x)
        top = Math.min(top, y); bottom = Math.max(bottom, y); count++
    }
    return { left, right, top, bottom, count }
}

// Independent forward projection of the eight corners of voxel (10, 0, 6).
// This is the billboard camera convention: X, Y, Z rotation, then position.
function projectedBounds(overrides) {
    const c = { zoom: 1, panX: 0, panY: 0, ...controls, ...overrides }
    const points = []
    for (const x of [10, 15]) for (const y of [-40, -35]) for (const z of [-10, -5]) {
        let p = [x, y * Math.cos(c.rotateX) - z * Math.sin(c.rotateX), y * Math.sin(c.rotateX) + z * Math.cos(c.rotateX)]
        p = [p[0] * Math.cos(c.rotateY) + p[2] * Math.sin(c.rotateY), p[1], -p[0] * Math.sin(c.rotateY) + p[2] * Math.cos(c.rotateY)]
        p = [p[0] * Math.cos(c.rotateZ) - p[1] * Math.sin(c.rotateZ), p[0] * Math.sin(c.rotateZ) + p[1] * Math.cos(c.rotateZ), p[2]]
        const focal = 1 / Math.tan(c.fieldOfView * Math.PI / 360)
        const scale = focal * c.viewScale * c.zoom * height / (2 * (80 - p[2] - c.posZ))
        points.push([width / 2 + (p[0] + c.posX) * scale - c.panX * height,
            height / 2 - (p[1] + c.posY) * scale + c.panY * height])
    }
    return { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
        top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) }
}

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width, height } })
        const errors = []
        page.on('pageerror', e => errors.push(e.message))
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
        await page.goto(baseUrl)
        await page.setContent(`<style>body{margin:0}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas>`)
        await page.evaluate(async ({ baseUrl, backend, width, height }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            window.cameraRenderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width, height,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await cameraRenderer.loadManifest()
            await cameraRenderer.loadEffects(['synth/solid', 'synth/testPattern', 'synth3d/heightmap3d', 'render/renderLandscape3d'])
        }, { baseUrl, backend, width, height })
        async function frame(name, dsl, singleVoxel = false) {
            const actualBackend = await page.evaluate(async ({ dsl, singleVoxel }) => {
                const r = cameraRenderer
                await r.compile(dsl); r.stop(); r.render(0)
                if (singleVoxel) {
                    const source = document.createElement('canvas'); source.width = 16; source.height = 16
                    const ctx = source.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(10, 6, 1, 1)
                    const surface = r.pipeline.surfaces.get('o1')
                    for (const id of [surface.read, surface.write]) r.updateTextureFromSource(id, source, { flipY: false })
                }
                r.render(0); r.render(0)
                await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
                const pass = r.pipeline.graph.passes.find(p => p.effectFunc === 'renderLandscape3d')
                const program = r.pipeline.backend.programs.get(pass.program)
                return {
                    name: r.pipeline.backend.getName().toLowerCase(),
                    defines: r.pipeline.graph.programs[pass.program].defines,
                    uniforms: program.uniforms ? Object.keys(program.uniforms) : program.packedUniformLayout.layout.map(field => field.name)
                }
            }, { dsl, singleVoxel })
            assert.equal(actualBackend.name, backend)
            if (!recordLegacy) {
                const perspective = dsl.includes('viewMode: perspective')
                assert.equal(actualBackend.defines.VIEW_MODE, perspective ? 2 : 1,
                    'projection must be baked into a distinct shader variant')
                assert.ok(!actualBackend.uniforms.includes('viewMode'), 'projection must not remain a runtime uniform')
                assert.ok(!actualBackend.uniforms.includes('densitySource'), 'diffuse channels must never select occupancy')
                if (backend === 'webgl2') {
                    const inactive = perspective ? [] : cameraKeys
                    for (const key of inactive) assert.ok(!actualBackend.uniforms.includes(key), `${key} must be pruned from the inactive mode`)
                }
            }
            const png = await page.locator('canvas').screenshot({ omitBackground: true })
            const pixels = PNG.sync.read(png).data
            if (artifacts) {
                fs.writeFileSync(path.join(artifacts, `${backend}-${name}.png`), png)
                fs.writeFileSync(path.join(artifacts, `${name}.dsl`), dsl)
            }
            if (backend === 'webgl2') captures.set(name, pixels)
            else assert.deepEqual(pixels, captures.get(name), `${name}: displayed pixels must match exactly across GPU backends`)
            return pixels
        }
        for (const [name, args] of Object.entries({ default: '', pan: ', panX: 0.1, panY: -0.18', zoom: ', zoom: 1.4' })) {
            const dsl = `search synth, synth3d, render\nheightmap3d(heightTex: testPattern(pattern: gradient), tex: testPattern(pattern: colorBars), volumeSize: x16, heightScale: 0.6, baseHeight: 0.1).renderLandscape3d(ambient: 1, diffuseIntensity: 0, specularIntensity: 0${args}).write(o0)\nrender(o0)`
            const pixels = await frame(`legacy-${name}`, dsl)
            const hash = createHash('sha256').update(pixels).digest('hex')
            baseline[name] = hash
            if (!recordLegacy) assert.equal(hash, legacyHashes[name], `${backend}: existing ${name} projection changed`)
        }
        if (!recordLegacy) {
            const oldCall = `search synth, synth3d, render\nheightmap3d(heightTex: testPattern(pattern: gradient), tex: testPattern(pattern: colorBars), volumeSize: x16).renderLandscape3d(64, 0.5, geometry, 1.4, 0.1, -0.18).write(o0)\nrender(o0)`
            const positional = await frame('legacy-positional', oldCall)
            const named = await frame('legacy-keyword', oldCall.replace('64, 0.5, geometry, 1.4, 0.1, -0.18', 'volumeSize: 64, threshold: 0.5, densitySource: geometry, zoom: 1.4, panX: 0.1, panY: -0.18'))
            assert.deepEqual(positional, named, 'existing positional arguments must preserve their meaning')
            const makeDsl = (args, color = '#00ffff', full = false) => `search synth, synth3d, render\nheightmap3d(heightTex: ${full ? 'solid(color: #ffffff)' : 'read(o1)'}, tex: solid(color: ${color}), volumeSize: x16, heightScale: ${full ? 1 : 0.0625}).renderLandscape3d(viewMode: perspective, ambient: 1, diffuseIntensity: 0, specularIntensity: 0, bgAlpha: 0${Object.entries(args).map(([k,v]) => `, ${k}: ${v}`).join('')}).write(o0)\nrender(o0)`
            const cases = { default: {}, axisAligned: { rotateX: 0 }, rotateY: { rotateY: 0.6 }, rotateZ: { rotateZ: 0.4 },
                combined: { rotateX: 0.4, rotateY: 0.7, rotateZ: 0.2 }, posX: { posX: 12 }, posY: { posY: 18 },
                posZ: { posZ: -30 }, fieldOfView: { fieldOfView: 90 }, viewScale: { viewScale: 1.3 },
                zoom: { zoom: 1.3 }, panX: { panX: 0.12 }, panY: { panY: 0.12 } }
            for (const [name, args] of Object.entries(cases)) {
                const camera = { posY: 24, ...args }
                const pixels = await frame(name, makeDsl(camera), true)
                const actual = bounds(pixels), expected = projectedBounds(camera)
                assert.ok(actual.count > 0, `${name}: no voxel was rendered`)
                for (const key of ['left','right','top','bottom']) assert.ok(Math.abs(actual[key] - expected[key]) < 2,
                    `${backend} ${name}.${key}: actual ${actual[key]}, expected ${expected[key]}`)
            }
            const black = await frame('black', makeDsl({ posY: 24 }, '#000000'), true)
            assert.deepEqual(bounds(black), bounds(captures.get('default')), 'diffuse RGB must not affect occupancy')
            const ignoredSelector = await frame('ignored-density-selector', makeDsl({ posY: 24, densitySource: 1 }, '#000000'), true)
            assert.deepEqual(ignoredSelector, black, 'legacy selector values must never derive occupancy from diffuse RGB')
            const orthoBlack = await frame('black-ortho', makeDsl({}, '#000000').replace('viewMode: perspective', 'viewMode: ortho'), true)
            const orthoColor = await frame('color-ortho', makeDsl({}).replace('viewMode: perspective', 'viewMode: ortho'), true)
            assert.ok(bounds(orthoBlack).count > 0, 'black diffuse voxels must remain visible in orthographic mode')
            assert.deepEqual(bounds(orthoBlack), bounds(orthoColor), 'orthographic occupancy must not depend on diffuse RGB')
            const inside = await frame('camera-inside', makeDsl({ posZ: 80, rotateX: 0 }, '#00ffff', true))
            assert.equal(bounds(inside).count, width * height, 'near-plane clipping inside an occupied volume must remain defined')
            const behind = await frame('behind-camera', makeDsl({ posZ: 160, rotateX: 0 }, '#00ffff', true))
            assert.equal(bounds(behind).count, 0, 'geometry behind the camera must not be rendered')
            const rotatedLightDsl = makeDsl({ rotateX: 0, rotateY: 3.14159265, posZ: -40, lightDirection: 'vec3(0, 0, 1)' }, '#ffffff', true)
                .replace('ambient: 1, diffuseIntensity: 0', 'ambient: 0, diffuseIntensity: 1')
            const rotatedLight = await frame('rotated-world-light', rotatedLightDsl)
            const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
            assert.deepEqual(Array.from(rotatedLight.subarray(center, center + 4)), [255,255,255,255],
                'a rotated cube face pointing at the world light must remain fully lit')
            const terrainDsl = `search synth, synth3d, render\nheightmap3d(heightTex: testPattern(pattern: gradient), tex: testPattern(pattern: colorBars), volumeSize: x32, heightScale: 0.6, baseHeight: 0.1).renderLandscape3d(viewMode: perspective, rotateX: 0.62, rotateY: 0.5, posY: 12).write(o0)\nrender(o0)`
            const terrain = await frame('lit-terrain', terrainDsl)
            assert.ok(new Set(Array.from({ length: width * height }, (_, i) => terrain.subarray(i * 4, i * 4 + 3).join(','))).size > 20,
                'the lit terrain must contain varying face colors')
            await page.evaluate(() => {
                const r = cameraRenderer
                const step = r.pipeline.graph.passes.find(p => p.effectFunc === 'renderLandscape3d').stepIndex
                r.applyStepParameterValues({ [`step_${step}`]: { posX: 12, fieldOfView: 90 } })
                r.render(0)
            })
            const liveCamera = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            const freshCamera = await frame('updated-camera', terrainDsl.replace('posY: 12', 'posY: 12, posX: 12, fieldOfView: 90'))
            assert.deepEqual(liveCamera, freshCamera, 'live camera controls must match a fresh compile')
            // Projection is structural: switch through a recompile, as the editor
            // does for define parameters. Camera positions remain live uniforms.
            await page.evaluate(async dsl => {
                const r = cameraRenderer
                await r.compile(dsl); r.stop(); r.render(0); r.render(0)
                await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
            }, terrainDsl.replace('viewMode: perspective', 'viewMode: ortho').replace('posY: 12', 'posY: 12, posX: 12, fieldOfView: 90'))
            const liveOrtho = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            const freshOrtho = await frame('return-to-ortho', terrainDsl.replace('viewMode: perspective', 'viewMode: ortho'))
            assert.deepEqual(liveOrtho, freshOrtho, 'switching back to ortho must ignore perspective camera controls')
            // The center pixel gives an exact (0,0,-1) ray, including both parallel slab branches.
            await page.evaluate(() => {
                const canvas = document.querySelector('canvas')
                canvas.width = 1; canvas.height = 1
                cameraRenderer.resize(1, 1)
            })
            const parallelHit = await frame('parallel-hit', makeDsl({ rotateX: 0 }, '#00ffff', true))
            assert.deepEqual(Array.from(parallelHit), [0,255,255,255], 'parallel rays inside the X/Y slabs must hit')
            const parallelMiss = await frame('parallel-miss', makeDsl({ rotateX: 0, posX: 50 }, '#00ffff', true))
            assert.equal(parallelMiss[3], 0, 'parallel rays outside a slab must miss')
        }
        assert.deepEqual(errors, [], `${backend} console errors`)
        await page.close()
        if (!recordLegacy) {
            const editor = await browser.newPage({ viewport: { width: 1280, height: 720 } })
            const editorErrors = []
            editor.on('pageerror', e => editorErrors.push(e.message))
            editor.on('console', m => { if (m.type() === 'error') editorErrors.push(m.text()) })
            await editor.goto(`${baseUrl}/demo/shaders/?backend=${backend === 'webgl2' ? 'glsl' : 'wgsl'}&effect=render.renderLandscape3d`)
            const waitForMode = async mode => {
                await editor.waitForFunction(expected => {
                    const p = window.__noisemakerCanvasRenderer?.pipeline
                    return p && !p.isCompiling && p.graph.passes.some(pass =>
                        pass.effectFunc === 'renderLandscape3d' && pass.program.endsWith(`__VIEW_MODE_${expected}`))
                }, mode, { timeout: 15000 }).catch(async error => {
                    console.error(editorErrors)
                    console.error(JSON.stringify(await editor.evaluate(() => ({
                        programs: Object.keys(window.__noisemakerCanvasRenderer.pipeline.graph.programs),
                        dsl: window.__noisemakerCanvasRenderer.currentDsl,
                        regenerated: window.__noisemakerRegenerateDsl(),
                        steps: [...window.__noisemakerProgramState._stepStates].map(([key, state]) => ({
                            key, effect: state.effectKey, mode: state.values.viewMode, spec: state.effectDef?.globals?.viewMode
                        }))
                    })), null, 2))
                    throw error
                })
                await editor.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
            }
            await waitForMode(1)
            const editorFrame = async name => {
                // Read the rendered surface directly: UI notification overlays
                // can cover the canvas in an element screenshot.
                const frame = await editor.evaluate(async () => {
                    const r = window.__noisemakerCanvasRenderer
                    r.stop(); r.render(0); r.render(0)
                    const pixels = await r.pipeline.backend.readPixels(r.pipeline.surfaces.get('o0').read)
                    // Encode bytes without millions of individual protocol values.
                    let bytes = ''
                    for (let offset = 0; offset < pixels.data.length; offset += 16384) {
                        bytes += String.fromCharCode(...pixels.data.subarray(offset, offset + 16384))
                    }
                    return { width: pixels.width, height: pixels.height, data: btoa(bytes),
                        backend: r.pipeline.backend.getName().toLowerCase() }
                })
                assert.equal(frame.backend, backend)
                const png = new PNG({ width: frame.width, height: frame.height })
                png.data = Buffer.from(frame.data, 'base64')
                assert.ok(png.data.some((value, index) => value !== png.data[index % 4]),
                    `${backend} ${name}: mode switching must render terrain, not only a flat background`)
                if (artifacts) fs.writeFileSync(path.join(artifacts, `${backend}-editor-${name}.png`), PNG.sync.write(png))
                return png.data
            }
            const rendererPanel = editor.locator('[data-effect-name="renderLandscape3d"]')
            for (const key of ['threshold', 'densitySource', 'viewScale']) {
                assert.equal(await rendererPanel.locator(`[data-param-key="${key}"]`).count(), 0,
                    `${key}: ineffective or duplicate controls must not appear in the renderer UI`)
            }
            const checkFramingControls = async (mode, original) => {
                for (const [key, value, initial] of [['zoom', 1.2, 1], ['panX', 0.08, 0], ['panY', -0.1, -0.18]]) {
                    const group = rendererPanel.locator(`[data-param-key="${key}"]`)
                    assert.equal(await group.evaluate(el => el.classList.contains('disabled')), false,
                        `${mode} ${key}: the visible control must be usable`)
                    const display = group.locator('.value-display')
                    await display.fill(String(value)); await display.press('Enter')
                    const changed = await editorFrame(`${mode}-${key}`)
                    assert.equal(changed.equals(original), false, `${mode} ${key}: editing the control must change pixels`)
                    await display.fill(String(initial)); await display.press('Enter')
                    assert.equal((await editorFrame(`${mode}-${key}-restored`)).equals(original), true,
                        `${mode} ${key}: restoring the control must restore the exact rendered frame`)
                }
            }
            const original = await editorFrame('ortho')
            await checkFramingControls('ortho', original)
            await editor.getByText('view…', { exact: true }).click()
            await editor.getByRole('button', { name: 'ortho ▼', exact: true }).click()
            await editor.getByRole('option', { name: 'perspective', exact: true }).click()
            await waitForMode(2)
            const perspective = await editorFrame('perspective')
            assert.equal(perspective.equals(original), false, `${backend}: the mode dropdown must change the rendered projection`)
            await checkFramingControls('perspective', perspective)
            await editor.getByRole('button', { name: 'perspective ▼', exact: true }).click()
            await editor.getByRole('option', { name: 'ortho', exact: true }).click()
            await waitForMode(1)
            const restored = await editorFrame('restored')
            assert.equal(restored.equals(original), true, `${backend}: mode recompilation must preserve height and color inputs`)
            await editor.getByRole('button', { name: 'ortho ▼', exact: true }).click()
            await editor.getByRole('option', { name: 'perspective', exact: true }).click()
            await waitForMode(2)
            const repeated = await editorFrame('perspective-repeated')
            assert.equal(repeated.equals(perspective), true, `${backend}: repeated mode changes must preserve the perspective render`)
            await editor.getByRole('button', { name: 'perspective ▼', exact: true }).click()
            await editor.getByRole('option', { name: 'ortho', exact: true }).click()
            await waitForMode(1)
            assert.equal((await editorFrame('ortho-repeated')).equals(original), true,
                `${backend}: repeated mode changes must preserve the orthographic render`)
            assert.deepEqual(editorErrors, [], `${backend} editor errors`)
            await editor.close()
        }
    }
    if (recordLegacy) console.log(JSON.stringify(baseline, null, 2))
    else console.log('PASS landscape camera projection, billboard control contract, legacy pixels and exact backend parity')
} finally {
    await browser.close(); await releaseServer()
}
