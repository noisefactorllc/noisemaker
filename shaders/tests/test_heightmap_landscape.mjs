import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

const height = {
    width: 4, height: 2,
    data: [0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 255, 255, 255, 255,
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]
}
const texel = { width: 2, height: 1, data: [0, 255, 255, 255, 0, 0, 0, 255] }
const dsl = `search synth3d, render
heightmap3d(heightTex: read(o1), tex: read(o2), volumeSize: x16, heightScale: 1)
  .renderLandscape3d(bgColor: #ffffff).write(o0)
render(o0)`

function assertPixelsEqual(actual, expected, message) {
    assert.equal(actual.length, expected.length, `${message}: frame size`)
    const mismatches = actual.reduce((count, value, i) => count + Number(value !== expected[i]), 0)
    assert.equal(mismatches, 0, `${message}: differing channels`)
}

async function runBackend(preferWebGPU) {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (['error', 'warning'].includes(message.type())) errors.push(message.text())
    })
    try {
        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
        await page.setContent('<link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block}</style><canvas id="canvas" width="128" height="128"></canvas>')
        await page.evaluate(async ({ baseUrl, preferWebGPU }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 128, height: 128,
                basePath: `${baseUrl}/shaders`, preferWebGPU })
            await renderer.loadManifest()
            await renderer.loadEffects(['synth3d/heightmap3d', 'render/renderLandscape3d', 'synth3d/shape3d', 'synth3d/cellularAutomata3d', 'filter3d/palette3d'])
        }, { baseUrl, preferWebGPU })
        async function compile(program, inputs = {}) {
            return page.evaluate(async ({ program, inputs }) => {
                await renderer.compile(program)
                renderer.stop()
                renderer.render(0)
                for (const [name, fixture] of Object.entries(inputs)) {
                    const canvas = document.createElement('canvas')
                    canvas.width = fixture.width
                    canvas.height = fixture.height
                    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(fixture.data), fixture.width, fixture.height), 0, 0)
                    const surface = renderer.pipeline.surfaces.get(name)
                    for (const id of [surface.read, surface.write]) renderer.updateTextureFromSource(id, canvas, { flipY: false })
                }
                renderer.render(0)
                renderer.render(0)
                await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                return renderer.pipeline.backend.getName()
            }, { program, inputs })
        }
        async function readOutput(func, output) {
            return page.evaluate(async ({ func, output }) => {
                const pass = renderer.pipeline.graph.passes.find(p => p.effectFunc === func)
                const frame = await renderer.pipeline.backend.readPixels(pass.outputs[output])
                return { width: frame.width, height: frame.height, data: Array.from(frame.data) }
            }, { func, output })
        }
        async function readSurface(name) {
            return page.evaluate(async name => {
                const surface = renderer.pipeline.surfaces.get(name)
                const frame = await renderer.pipeline.backend.readPixels(surface.read)
                return { width: frame.width, height: frame.height, data: Array.from(frame.data) }
            }, name)
        }
        const backend = await compile(dsl, { o1: height, o2: texel })
        assert.equal(backend, preferWebGPU ? 'WebGPU' : 'WebGL2', 'requested backend must execute')
        const volume = await readOutput('heightmap3d', 'color')
        const geometry = await readOutput('heightmap3d', 'geoOut')
        assert.deepEqual([volume.width, volume.height], [16, 256], 'volumeSize must size the native atlas')
        function voxel(frame, x, y, z) {
            const row = preferWebGPU ? y + z * 16 : 255 - y - z * 16
            return frame.data.slice((row * 16 + x) * 4, (row * 16 + x) * 4 + 4)
        }
        // Hand-derived column heights, including RGB luminance rather than red-channel height.
        const expectedHeights = [[0, 4, 8, 16], [3, 11, 1, 16]]
        for (const [zi, z] of [1, 9].entries()) for (const [xi, x] of [1, 5, 9, 13].entries()) {
            const expectedHeight = expectedHeights[zi][xi]
            for (let y = 0; y < 16; y++) {
                const occupied = y < expectedHeight
                const color = x < 8 ? [0, 255, 255] : [0, 0, 0]
                assert.deepEqual(voxel(volume, x, y, z), occupied ? [...color, 255] : [0, 0, 0, 0], `${backend}: column ${x},${z} at y=${y}`)
                assert.equal(voxel(geometry, x, y, z)[3], occupied ? 255 : 0, 'geometry density must be independent of color')
            }
        }
        const screenGeo = await readOutput('renderLandscape3d', 'geoOut')
        assert.deepEqual([screenGeo.width, screenGeo.height], [128, 128], 'renderer geometry must be screen sized')
        assert.ok(screenGeo.data.some((v, i) => i % 4 === 3 && v < 255), 'renderer must hit colored and black voxels')
        const screenshot = PNG.sync.read(await page.locator('canvas').screenshot())
        assert.ok(screenshot.data.some((v, i) => i % 4 === 0 && v < 20), 'black diffuse columns must remain visible on white background')

        await page.evaluate(() => {
            const step = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'heightmap3d').stepIndex
            renderer.applyStepParameterValues({ [`step_${step}`]: { heightScale: 0.5, baseHeight: 0.25 } })
            renderer.render(0)
        })
        const adjusted = await readOutput('heightmap3d', 'color')
        assert.equal(voxel(adjusted, 1, 3, 1)[3], 255, 'base height must fill four voxels in a black height column')
        assert.equal(voxel(adjusted, 1, 4, 1)[3], 0, 'base height must stop at the configured height')
        assert.equal(voxel(adjusted, 13, 11, 1)[3], 255, 'height scale and base height must combine')
        assert.equal(voxel(adjusted, 13, 12, 1)[3], 0, 'height scale must update live')

        await compile(dsl, { o1: height, o2: { width: 1, height: 1, data: [255, 0, 255, 255] } })
        assertPixelsEqual((await readOutput('heightmap3d', 'geoOut')).data, geometry.data, 'changing only diffuse color must preserve all geometry')

        const exportedDsl = dsl.replace('.renderLandscape3d(bgColor: #ffffff)', '.write3d(vol0, geo0)\nread3d(vol0, geo0).renderLandscape3d(bgColor: #ffffff)')
        await compile(exportedDsl, { o1: height, o2: texel })
        const exportedVolume = await readSurface('vol0')
        const exportedGeo = await readSurface('geo0')
        assert.deepEqual([exportedVolume.width, exportedVolume.height, exportedGeo.width, exportedGeo.height], [16, 256, 16, 256], 'exported volume and geometry must retain atlas dimensions')
        assertPixelsEqual(exportedVolume.data, volume.data, 'write3d must copy each color texel exactly')
        assertPixelsEqual(exportedGeo.data, geometry.data, 'write3d must copy each geometry texel exactly')
        assert.equal(await page.evaluate(() => renderer.pipeline.graph.passes.find(p => p.effectFunc === 'renderLandscape3d').uniforms.volumeSize), 16, 'read3d must restore the producer volume size')
        assertPixelsEqual(PNG.sync.read(await page.locator('canvas').screenshot()).data, screenshot.data, 'write3d/read3d must retain volume size, color and geometry')

        await page.evaluate(() => {
            const step = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'heightmap3d').stepIndex
            renderer.applyStepParameterValues({ [`step_${step}`]: { volumeSize: 32 } })
            renderer.render(0)
            renderer.render(0)
        })
        const resizedExport = await readSurface('vol0')
        assert.deepEqual([resizedExport.width, resizedExport.height], [32, 1024], 'live size changes must resize the exported atlas')
        const resizedView = PNG.sync.read(await page.locator('canvas').screenshot())
        await compile(dsl.replace('x16', 'x32'), { o1: height, o2: texel })
        assertPixelsEqual(PNG.sync.read(await page.locator('canvas').screenshot()).data, resizedView.data, 'live volume resize must propagate through read3d')

        const rewriteDsl = exportedDsl.replace('search synth3d, render', 'search synth3d, filter3d, render')
            .replace('read3d(vol0, geo0).renderLandscape3d', `read3d(vol0, geo0).palette3d().write3d(vol0, geo0)
read3d(vol0, geo0).palette3d().write3d(vol0, geo0)
read3d(vol0, geo0).renderLandscape3d`)
        await compile(rewriteDsl, { o1: height, o2: texel })
        await page.evaluate(() => {
            const step = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'heightmap3d').stepIndex
            renderer.applyStepParameterValues({ [`step_${step}`]: { volumeSize: 32 } })
            renderer.render(0)
            renderer.render(0)
        })
        const rewrittenVolume = await readSurface('vol0')
        assert.deepEqual([rewrittenVolume.width, rewrittenVolume.height], [32, 1024], 'same-surface filters must preserve live atlas sizing')
        const rewrittenView = PNG.sync.read(await page.locator('canvas').screenshot())
        await compile(dsl.replace('x16', 'x32').replace('search synth3d, render', 'search synth3d, filter3d, render')
            .replace('.renderLandscape3d', '.palette3d().palette3d().renderLandscape3d'), { o1: height, o2: texel })
        assertPixelsEqual(PNG.sync.read(await page.locator('canvas').screenshot()).data, rewrittenView.data, 'same-surface filters must match direct chaining after live resizing')

        await compile(`search synth3d, render
read3d(vol1, geo1).renderLandscape3d(bgColor: #ffffff).write(o0)
read3d(vol0, geo0).write3d(vol1, geo1)
heightmap3d(heightTex: read(o1), tex: read(o2), volumeSize: x16, heightScale: 1).write3d(vol0, geo0)
render(o0)`, { o1: height, o2: texel })
        await page.evaluate(() => { for (let i = 0; i < 5; i++) renderer.render(0) })
        assertPixelsEqual(PNG.sync.read(await page.locator('canvas').screenshot()).data, screenshot.data, 'previous-frame readers and volume relays must preserve the same voxel layout')

        await compile(dsl, { o1: { width: 1, height: 1, data: [0, 0, 0, 255] }, o2: texel })
        const empty = await readOutput('heightmap3d', 'color')
        assert.ok(empty.data.every(v => v === 0), 'zero height must leave every voxel empty')
        const emptyScreen = PNG.sync.read(await page.locator('canvas').screenshot())
        assert.ok(emptyScreen.data.every(v => v === 255), 'empty heightfield must render the exact background')

        await compile(`search synth3d, filter3d, render
shape3d(volumeSize: x32).palette3d().renderLandscape3d().write(o0)
render(o0)`)
        const inherited = await readOutput('palette3d', 'fragColor')
        assert.deepEqual([inherited.width, inherited.height], [32, 1024], 'existing 3D chains must retain their volume size')
        const nativeGeo = await readOutput('renderLandscape3d', 'geoOut')
        assert.ok(nativeGeo.data.some((v, i) => i % 4 === 3 && v < 255), 'native 3D geometry must render')

        await compile(`search synth3d, render
cellularAutomata3d(volumeSize: x16).renderLandscape3d(densitySource: red).write(o0)
render(o0)`)
        const scalarGeo = await readOutput('renderLandscape3d', 'geoOut')
        assert.ok(scalarGeo.data.some((v, i) => i % 4 === 3 && v < 255), 'native scalar-field chains without geometry must render from red density')
        assert.deepEqual(errors, [], `${backend} console must be clean`)
        console.log(`PASS heightmap/landscape voxel, color, luminance, empty-volume and native-chain contracts (${backend})`)
        return screenshot
    } finally {
        await page.close()
    }
}
try {
    const gl = await runBackend(false)
    const gpu = await runBackend(true)
    assertPixelsEqual(gpu.data, gl.data, 'displayed WebGL2 and WebGPU heightfield pixels must match exactly')
    console.log('PASS exact displayed-pixel parity')
} finally {
    await browser.close()
    await releaseServer()
}
