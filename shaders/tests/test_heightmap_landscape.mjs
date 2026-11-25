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
            await renderer.loadEffects(['synth3d/heightmap3d', 'render/renderLandscape3d', 'synth3d/shape3d', 'synth3d/noise3d', 'filter3d/palette3d', 'synth/solid', 'synth/testPattern', 'render/pointsEmit'])
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
        // Fixture row 0 is texture row 0, the image's bottom row, so it fills the far half of z.
        const expectedHeights = [[3, 11, 1, 16], [0, 4, 8, 16]]
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

        // Products initialize ProgramState after compiling. Its pointsEmit
        // sizing writes must preserve the landscape, including after an older
        // host-wide size was superseded by the DSL values.
        const mixedDsl = dsl.replace('search synth3d, render', 'search synth, synth3d, render')
            .replace('render(o0)', `solid().pointsEmit(stateSize: x64).write(o3)
solid().pointsEmit(stateSize: x128).write(o4)
render(o0)`)
        await compile(mixedDsl, { o1: height, o2: texel })
        const sizes = await page.evaluate(async ({ baseUrl, mixedDsl }) => {
            const { ProgramState } = await import(`${baseUrl}/demo/shaders/lib/program-state.js`)
            renderer.setUniform('volumeSize', 32)
            const state = new ProgramState({ renderer })
            state.fromDsl(mixedDsl)
            renderer.render(0)
            await renderer.pipeline.backend.waitForIdle?.()
            return ['node_0_volumeCache', 'node_0_geoBuffer', 'global_xyz_node_4_read', 'global_xyz_node_7_read']
                .map(id => {
                    const texture = renderer.pipeline.backend.textures.get(id)
                    return [texture.width, texture.height]
                })
        }, { baseUrl, mixedDsl })
        assert.deepEqual(sizes, [[16, 256], [16, 256], [64, 64], [128, 128]], `${backend}: ProgramState texture sizes`)
        assertPixelsEqual(PNG.sync.read(await page.locator('canvas').screenshot()).data, screenshot.data,
            `${backend}: ProgramState initialization must preserve displayed landscape pixels`)
        console.log(`PASS mixed landscape/particle ProgramState initialization preserves displayed pixels (${backend})`)
        await compile(dsl, { o1: height, o2: texel })

        await page.evaluate(() => {
            const step = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'heightmap3d').stepIndex
            renderer.applyStepParameterValues({ [`step_${step}`]: { heightScale: 0.5, baseHeight: 0.25 } })
            renderer.render(0)
        })
        const adjusted = await readOutput('heightmap3d', 'color')
        assert.equal(voxel(adjusted, 1, 3, 9)[3], 255, 'base height must fill four voxels in a black height column')
        assert.equal(voxel(adjusted, 1, 4, 9)[3], 0, 'base height must stop at the configured height')
        assert.equal(voxel(adjusted, 13, 11, 9)[3], 255, 'height scale and base height must combine')
        assert.equal(voxel(adjusted, 13, 12, 9)[3], 0, 'height scale must update live')

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
        // The readers read surfaces that later chains write, so this program
        // holds simulation state: each relay hop is one step of the fixed-step
        // clock, and renders at one time do not step. Five grid steps settle it.
        await page.evaluate(() => { for (let i = 0; i < 5; i++) renderer.render(i / 600) })
        assertPixelsEqual(PNG.sync.read(await page.locator('canvas').screenshot()).data, screenshot.data, 'previous-frame readers and volume relays must preserve the same voxel layout')

        await compile(dsl, { o1: { width: 1, height: 1, data: [0, 0, 0, 255] }, o2: texel })
        const empty = await readOutput('heightmap3d', 'color')
        assert.ok(empty.data.every(v => v === 0), 'zero height must leave every voxel empty')
        const emptyScreen = PNG.sync.read(await page.locator('canvas').screenshot())
        assert.ok(emptyScreen.data.every(v => v === 255), 'empty heightfield must render the exact background')

        // Seen from directly above, the volume shows its images as authored: image
        // right is screen right and image top is screen top, with no mirror. A uvMap
        // color image carries u in red and v in green, so each axis reads directly.
        await compile('search synth\ntestPattern(pattern: uvMap).write(o0)\nrender(o0)')
        const authored = PNG.sync.read(await page.locator('canvas').screenshot())
        await compile(`search synth, synth3d, render
heightmap3d(heightTex: solid(color: #ffffff), tex: testPattern(pattern: uvMap), volumeSize: x16, heightScale: 1)
  .renderLandscape3d(viewMode: perspective, rotateX: 1.5708, posZ: -40, ambient: 1, diffuseIntensity: 0, specularIntensity: 0).write(o0)
render(o0)`)
        const topDown = PNG.sync.read(await page.locator('canvas').screenshot())
        // The cube's top face covers pixels 20-108 of the 128-pixel frame.
        const corners = { topLeft: [34, 34], topRight: [94, 34], bottomLeft: [34, 94], bottomRight: [94, 94] }
        const sample = png => Object.fromEntries(Object.entries(corners).map(([name, [x, y]]) =>
            [name, Array.from(png.data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 3))]))
        const image = sample(authored), view = sample(topDown)
        for (const [name, rgb] of Object.entries(view)) assert.equal(rgb[2], 0, `${backend}: top-down ${name} must show the top face, not the background`)
        const across = rgb => rgb.topRight[0] - rgb.topLeft[0]
        const down = rgb => rgb.bottomLeft[1] - rgb.topLeft[1]
        assert.ok(Math.abs(across(image)) > 64 && Math.abs(down(image)) > 64, 'the uvMap reference must vary along both axes')
        assert.ok(Math.sign(across(view)) === Math.sign(across(image)) && Math.abs(across(view)) > 64,
            `${backend}: seen from above, image right must be screen right (red ${view.topLeft[0]} -> ${view.topRight[0]})`)
        assert.ok(Math.sign(down(view)) === Math.sign(down(image)) && Math.abs(down(view)) > 64,
            `${backend}: seen from above, image top must be screen top (green ${view.topLeft[1]} -> ${view.bottomLeft[1]}, authored ${image.topLeft[1]} -> ${image.bottomLeft[1]})`)
        assert.ok(Math.abs(view.bottomLeft[0] - view.topLeft[0]) <= 16 && Math.abs(view.topRight[1] - view.topLeft[1]) <= 16,
            `${backend}: seen from above, the image must not be rotated`)

        await compile(`search synth3d, filter3d, render
shape3d(volumeSize: x32).palette3d().renderLandscape3d().write(o0)
render(o0)`)
        const inherited = await readOutput('palette3d', 'fragColor')
        assert.deepEqual([inherited.width, inherited.height], [32, 1024], 'existing 3D chains must retain their volume size')
        const nativeGeo = await readOutput('renderLandscape3d', 'geoOut')
        assert.ok(nativeGeo.data.some((v, i) => i % 4 === 3 && v < 255), 'native 3D geometry must render')

        await compile(`search synth3d, render
noise3d(volumeSize: x16).renderLandscape3d().write(o0)
render(o0)`)
        const scalarGeo = await readOutput('renderLandscape3d', 'geoOut')
        assert.ok(scalarGeo.data.some((v, i) => i % 4 === 3 && v < 255), 'native scalar fields must render from their geometry density')
        assert.deepEqual(errors, [], `${backend} console must be clean`)
        console.log(`PASS heightmap/landscape voxel, color, luminance, empty-volume and native-chain contracts (${backend})`)
        return screenshot
    } finally {
        await page.close()
    }
}
// Seen from directly above, the terrain has the proportions of the frame, and it
// shows its images as authored on a frame of any shape: a square frame, a wide
// one and a tall one. Each terrain here fits inside its frame.
const frameShapes = [
    { width: 128, height: 128, posZ: -40 },
    { width: 256, height: 128, posZ: -40 },
    { width: 128, height: 256, posZ: -120 },
]
const outOfProportion = []
async function runFrameShapes(preferWebGPU) {
    const backend = preferWebGPU ? 'webgpu' : 'webgl2'
    for (const { width, height, posZ } of frameShapes) {
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => {
            if (isReadbackPerformanceWarning(message.type(), message.text())) return
            if (['error', 'warning'].includes(message.type())) errors.push(message.text())
        })
        try {
            await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
            await page.setContent(`<link rel="icon" href="data:,"><style>body{margin:0}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas>`)
            await page.evaluate(async ({ baseUrl, preferWebGPU, width, height }) => {
                const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
                window.renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width, height,
                    basePath: `${baseUrl}/shaders`, preferWebGPU })
                await renderer.loadManifest()
                await renderer.loadEffects(['synth3d/heightmap3d', 'render/renderLandscape3d', 'synth/solid', 'synth/testPattern'])
            }, { baseUrl, preferWebGPU, width, height })
            async function frame(program) {
                const name = await page.evaluate(async program => {
                    await renderer.compile(program)
                    renderer.stop()
                    for (let i = 0; i < 3; i++) renderer.render(0)
                    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
                    return renderer.pipeline.backend.getName().toLowerCase()
                }, program)
                assert.equal(name, backend, 'requested backend must execute')
                return PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true }))
            }
            const authored = await frame('search synth\ntestPattern(pattern: uvMap).write(o0)\nrender(o0)')
            const topDown = await frame(`search synth, synth3d, render
heightmap3d(heightTex: solid(color: #ffffff), tex: testPattern(pattern: uvMap), volumeSize: x16, heightScale: 1)
  .renderLandscape3d(viewMode: perspective, rotateX: 1.5708, posZ: ${posZ}, bgAlpha: 0, ambient: 1, diffuseIntensity: 0, specularIntensity: 0).write(o0)
render(o0)`)
            // The box of the terrain's pixels; the background is transparent.
            const box = { x0: width, x1: -1, y0: height, y1: -1 }
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (topDown.data[(y * width + x) * 4 + 3] === 0) continue
                    box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x)
                    box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y)
                }
            }
            const label = `${backend} ${width} x ${height}`
            assert.ok(box.x1 >= box.x0, `${label}: the terrain must be visible`)
            assert.ok(box.x0 > 0 && box.y0 > 0 && box.x1 < width - 1 && box.y1 < height - 1,
                `${label}: the terrain must fit inside the frame (x ${box.x0} to ${box.x1}, y ${box.y0} to ${box.y1})`)
            const boxWidth = box.x1 - box.x0 + 1, boxHeight = box.y1 - box.y0 + 1
            assert.ok(Math.abs(box.x0 + box.x1 - (width - 1)) <= 3 && Math.abs(box.y0 + box.y1 - (height - 1)) <= 3,
                `${label}: the terrain must be centered in the frame (x ${box.x0} to ${box.x1}, y ${box.y0} to ${box.y1})`)
            // Points toward the corners: of the whole frame in the authored image, of the terrain in the view.
            const sample = (png, area) => {
                const dx = Math.round((area.x1 - area.x0 + 1) * 0.27), dy = Math.round((area.y1 - area.y0 + 1) * 0.27)
                const at = (x, y) => Array.from(png.data.slice((y * width + x) * 4, (y * width + x) * 4 + 3))
                return { topLeft: at(area.x0 + dx, area.y0 + dy), topRight: at(area.x1 - dx, area.y0 + dy), bottomLeft: at(area.x0 + dx, area.y1 - dy) }
            }
            const image = sample(authored, { x0: 0, x1: width - 1, y0: 0, y1: height - 1 }), view = sample(topDown, box)
            const across = rgb => rgb.topRight[0] - rgb.topLeft[0]
            const down = rgb => rgb.bottomLeft[1] - rgb.topLeft[1]
            assert.ok(Math.abs(across(image)) > 64 && Math.abs(down(image)) > 64, 'the uvMap reference must vary along both axes')
            assert.ok(Math.sign(across(view)) === Math.sign(across(image)) && Math.abs(across(view)) > 64,
                `${label}: seen from above, image right must be screen right (red ${view.topLeft[0]} -> ${view.topRight[0]})`)
            assert.ok(Math.sign(down(view)) === Math.sign(down(image)) && Math.abs(down(view)) > 64,
                `${label}: seen from above, image top must be screen top (green ${view.topLeft[1]} -> ${view.bottomLeft[1]}, authored ${image.topLeft[1]} -> ${image.bottomLeft[1]})`)
            assert.ok(Math.abs(view.bottomLeft[0] - view.topLeft[0]) <= 24 && Math.abs(view.topRight[1] - view.topLeft[1]) <= 24,
                `${label}: seen from above, the image must not be rotated`)
            const shape = width / height
            if (Math.abs(boxWidth / boxHeight - shape) > shape * 0.1) {
                outOfProportion.push(`${label}: seen from above, the terrain is ${boxWidth} by ${boxHeight} pixels, and its frame is ${width} by ${height}`)
            }
            assert.deepEqual(errors, [], `${label} console must be clean`)
        } finally {
            await page.close()
        }
    }
    if (!outOfProportion.some(line => line.startsWith(backend))) {
        console.log(`PASS heightmap seen from above shows its images as authored, in the frame's proportions (${backend})`)
    }
}
try {
    const gl = await runBackend(false)
    const gpu = await runBackend(true)
    assertPixelsEqual(gpu.data, gl.data, 'displayed WebGL2 and WebGPU heightfield pixels must match exactly')
    console.log('PASS exact displayed-pixel parity')
    await runFrameShapes(false)
    await runFrameShapes(true)
    assert.deepEqual(outOfProportion, [])
} finally {
    await browser.close()
    await releaseServer()
}
