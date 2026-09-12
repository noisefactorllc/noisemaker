import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const recordLegacy = process.argv.includes('--record-legacy')
const fixturePath = new URL('./fixtures/points-render-legacy-hashes.json', import.meta.url)
const legacyHashes = recordLegacy ? {} : JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const recorded = {}, captures = new Map()
const width = 160, height = 144
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

function occupied(pixels) {
    const positions = []
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i]) positions.push([(i >> 2) % width, Math.floor((i >> 2) / width)])
    }
    return positions
}

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage({ viewport: { width, height } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(baseUrl)
        await page.setContent(`<canvas width="${width}" height="${height}"></canvas>`)
        await page.evaluate(async ({ baseUrl, backend, width, height }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            window.pointsCamera = new CanvasRenderer({ canvas: document.querySelector('canvas'), width, height,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await pointsCamera.loadManifest()
            await pointsCamera.loadEffects(['synth/solid', 'synth/testPattern', 'render/pointsEmit',
                'points/heightGrid', 'render/pointsRender', 'render/pointsBillboardRender'])
        }, { baseUrl, backend, width, height })
        async function capture(name, dsl, values) {
            const actualBackend = await page.evaluate(async ({ dsl, values }) => {
                const r = pointsCamera
                if (dsl) {
                    try { await r.compile(dsl) } catch (error) {
                        throw new Error(error.message || JSON.stringify(error))
                    }
                    r.stop()
                }
                if (values) {
                    const step = r.pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsRender').stepIndex
                    r.applyStepParameterValues({ [`step_${step}`]: values })
                }
                r.render(0)
                await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
                return r.pipeline.backend.getName().toLowerCase()
            }, { dsl, values })
            assert.equal(actualBackend, backend, 'requested backend must execute')
            const pixels = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            if (!name.startsWith('legacy-')) {
                if (backend === 'webgl2') captures.set(name, pixels)
                else assert.deepEqual(pixels, captures.get(name), `${name}: backend pixels differ`)
            }
            return pixels
        }
        recorded[backend] = {}
        for (const [name, chain, args] of [
            ['flat', '', ''],
            ['ortho-2d', '', ', viewMode: ortho, rotateX: 0.4, rotateZ: 0.2, posX: 0.05, posY: -0.07'],
            ['ortho-world', '.heightGrid(gridScale: 47, heightScale: 13)', ', viewMode: ortho, rotateX: 0.4, rotateY: 0.2, posX: 3, posY: -4']
        ]) {
            const dsl = `search synth, points, render\ntestPattern(pattern: colorBars).pointsEmit(stateSize: x64, layout: grid)${chain}.pointsRender(intensity: 0, inputIntensity: 0, matteOpacity: 0, density: 100${args}).write(o0)\nrender(o0)`
            const pixels = await capture(`legacy-${name}`, dsl)
            assert.ok(occupied(pixels).length > 0, `${name}: legacy fixture must be visible`)
            const hash = createHash('sha256').update(pixels).digest('hex')
            recorded[backend][name] = hash
            if (!recordLegacy) {
                assert.equal(hash, legacyHashes[backend][name], `${backend} ${name}: existing projection changed`)
                const ignored = await capture(`legacy-${name}-new-controls`, null, { posZ: 75, fieldOfView: 120 })
                assert.deepEqual(ignored, pixels, 'perspective-only controls must preserve old views')
            }
        }
        if (!recordLegacy) {
            const camera = { rotateX: 0, rotateY: 0, rotateZ: 0, viewScale: 1, posX: 0, posY: 0, posZ: 0, fieldOfView: 90 }
            const makeDsl = (values = {}, grid = true, renderer = 'pointsRender') => {
                const params = { ...camera, ...values }
                const renderArgs = renderer === 'pointsRender' ? 'matteOpacity: 0' : 'shapeMode: square, pointSize: 8, depositOpacity: 100'
                return `search synth, points, render\nsolid(color: #ffffff).pointsEmit(stateSize: x64, layout: center, resetState: true)${grid ? '.heightGrid(gridScale: 64, heightScale: 0, heightOffset: 12)' : ''}.${renderer}(viewMode: perspective, density: 0.001, intensity: 0, inputIntensity: 0, ${renderArgs}${Object.entries(params).map(([key, value]) => `, ${key}: ${value}`).join('')}).write(o0)\nrender(o0)`
            }
            // The first grid slot is (-31.5, 12, -31.5). These pixel locations
            // are hand-derived for the camera at Z=80 and a 160 by 144 viewport.
            for (const [name, values, position] of [
                ['perspective', {}, [59, 64]],
                ['fov-60', { fieldOfView: 60 }, [44, 58]],
                ['fov-120', { fieldOfView: 120 }, [68, 67]],
                ['forward', { posZ: 40 }, [48, 59]],
                ['backward', { posZ: -40 }, [65, 66]],
                ['pan-x', { posX: 20 }, [72, 64]],
                ['pan-y', { posY: -10 }, [59, 70]],
                ['zoom', { viewScale: 2 }, [39, 56]],
                ['rotate-x', { rotateX: 1.57079632679 }, [46, 38]],
                ['rotate-y', { rotateY: 1.57079632679 }, [33, 54]],
                ['rotate-z', { rotateZ: 1.57079632679 }, [72, 92]]
            ]) {
                const pixels = await capture(name, makeDsl(values))
                assert.deepEqual(occupied(pixels), [position], `${backend} ${name}: incorrect camera projection`)
            }
            const centered = await capture('world-coordinates', makeDsl({}, false))
            assert.deepEqual(occupied(centered), [[80, 71]], 'perspective must not recenter normalized coordinates')
            await capture('live-initial', makeDsl())
            const live = await capture('live-camera', null, { posZ: 40, fieldOfView: 120 })
            assert.deepEqual(occupied(live), [[61, 65]], 'camera controls must update without recompiling')
            for (const [name, posZ] of [['near-plane', 111.45], ['behind-camera', 120]]) {
                const pixels = await capture(name, makeDsl({ posX: 31.5, posY: -12, posZ }))
                assert.deepEqual(occupied(pixels), [], `${name}: particles must be clipped before projection`)
            }
            const visible = await capture('before-near-plane', makeDsl({ posX: 31.5, posY: -12, posZ: 111.3 }))
            assert.equal(occupied(visible).length, 1, 'a point in front of the near plane must remain visible')
            const combined = { rotateX: 0.4, rotateY: 0.6, rotateZ: 0.2, posX: 8, posY: -3, posZ: 12, fieldOfView: 75 }
            const point = occupied(await capture('combined', makeDsl(combined)))[0]
            const billboard = occupied(await capture('billboard-reference', makeDsl(combined, true, 'pointsBillboardRender')))
            assert.ok(point && billboard.length > 0, `camera alignment fixture must render: point=${JSON.stringify(point)}, billboard pixels=${billboard.length}`)
            for (const axis of [0, 1]) {
                const center = billboard.reduce((sum, pixel) => sum + pixel[axis], 0) / billboard.length
                assert.ok(Math.abs(point[axis] - center) <= 1, 'combined camera transform must align with billboard rendering')
            }
        }
        assert.deepEqual(errors, [], `${backend}: no browser or GPU errors`)
        console.log(`PASS ${backend}: ${recordLegacy ? 'legacy capture' : 'pointsRender camera and legacy pixels'}`)
        await page.close()
    }
    if (recordLegacy) fs.writeFileSync(fixturePath, JSON.stringify(recorded, null, 2) + '\n')
} finally {
    await browser.close()
    await releaseServer()
}
