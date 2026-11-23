import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

// A voxel ray that passes through the edge shared by two cell boundaries
// crosses both at one distance and enters the cell beyond the edge. Whether
// the two crossings compare equal depends on how a shader compiler rounds the
// ray, so a pixel on such an edge must show what the pixels beside it show
// wherever the surface is one continuous wall. Each case here puts its rays
// on such edges by its shape, so the crossings are equal on every compiler.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

// The default heightmap3d program at volume size x128 on a 257 by 129 frame, as
// a port's parity run renders it. The frame is an odd number of pixels wide and
// the program has no horizontal pan, so the rays of its center column cross x
// and z boundaries at one distance.
const measured = {
    width: 257, height: 129,
    dsl: `search synth, synth3d, render

noise(scaleX: 90, scaleY: 90, colorMode: mono, speed: 0).write(o1)
gradient(type: fourCorners, color1: #006e94, color2: #24e4ff, color3: #bcff46, color4: #efffff).write(o2)
heightmap3d(heightTex: read(o1), tex: read(o2), volumeSize: x128).renderLandscape3d(panY: -0.18).write(o0)
render(o0)`
}

// A white cliff, lit only from the side it faces, so its face is white and
// every other face is black. `fill` is the part of the 16 x 16 height image
// that is full height: [x, y, width, height].
const cliffProgram = view => `search synth, synth3d, render
heightmap3d(heightTex: read(o1), tex: solid(color: #ffffff), volumeSize: x16, heightScale: 1, baseHeight: 0).renderLandscape3d(${view}, ambient: 0, diffuseIntensity: 1, specularIntensity: 0, bgAlpha: 0).write(o0)
render(o0)`
// Orthographic view of a cliff that faces +z. The frame is an odd number of
// pixels wide, so the rays of its center column cross x and z boundaries at
// one distance all the way.
const centerCliff = { width: 129, height: 129, fill: [0, 8, 16, 8], dsl: cliffProgram('lightDirection: vec3(0, 0, 1)') }
// Perspective view, from the volume's axis, of a cliff that faces -x. Every
// ray of the screen diagonal crosses x and y boundaries at one distance.
const diagonalCliff = { width: 128, height: 128, fill: [12, 0, 4, 16], dsl: cliffProgram('viewMode: perspective, rotateX: 0, lightDirection: vec3(-1, 0, 0)') }
const WHITE = '255,255,255,255'

async function openRenderer(backend, { width, height }) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`${baseUrl}/shaders/tests/blank.html`)
    await page.setContent(`<style>body{margin:0}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas>`)
    await page.evaluate(async ({ baseUrl, backend, width, height }) => {
        const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
        window.tieRenderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width, height,
            basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
        await tieRenderer.loadManifest()
        await tieRenderer.loadEffects(['synth/noise', 'synth/gradient', 'synth/solid', 'synth3d/heightmap3d', 'render/renderLandscape3d'])
    }, { baseUrl, backend, width, height })
    const shown = async () => PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true }))
    const pixel = (frame, x, y) => Array.from(frame.data.subarray((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 4)).join(',')
    // Compile a cliff program and give it its height image.
    const showCliff = async ({ dsl, fill }) => {
        const name = await page.evaluate(async ({ dsl, fill }) => {
            const r = tieRenderer
            await r.compile(dsl); r.stop(); r.render(0)
            const source = document.createElement('canvas'); source.width = 16; source.height = 16
            const ctx = source.getContext('2d')
            ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 16, 16)
            ctx.fillStyle = 'white'; ctx.fillRect(...fill)
            const surface = r.pipeline.surfaces.get('o1')
            for (const id of [surface.read, surface.write]) r.updateTextureFromSource(id, source, { flipY: false })
            r.render(0); r.render(0)
            await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
            return r.pipeline.backend.getName().toLowerCase()
        }, { dsl, fill })
        assert.equal(name, backend, 'requested backend must execute')
        return shown()
    }
    return { page, errors, shown, pixel, showCliff }
}

// Every backend and view is checked before the verdict, so one run shows each failure.
const failures = []
try {
    const centerColumns = {}
    for (const backend of ['webgl2', 'webgpu']) {
        // The measured program. On the rows where the pixels on both sides of
        // the center column show one lit wall, the column shows that wall too.
        const whole = await openRenderer(backend, measured)
        const name = await whole.page.evaluate(async dsl => {
            const r = tieRenderer
            await r.compile(dsl); r.stop(); r.render(0); r.render(0); r.render(0)
            await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
            return r.pipeline.backend.getName().toLowerCase()
        }, measured.dsl)
        assert.equal(name, backend, 'requested backend must execute')
        const wholeFrame = await whole.shown()
        const column = (measured.width - 1) / 2
        const rgb = (x, y) => whole.pixel(wholeFrame, x, y).split(',').slice(0, 3).map(Number)
        const rows = Array.from({ length: measured.height }, (_, y) => y)
        const wallRows = rows.filter(y => {
            const left = rgb(column - 1, y), right = rgb(column + 1, y)
            return left[1] >= 128 && right[1] >= 128 && left.every((value, c) => Math.abs(value - right[c]) <= 8)
        })
        assert.ok(wallRows.length >= 3, `${backend}: the center column of the measured program must cross a lit wall`)
        const offWall = wallRows.filter(y => {
            const left = rgb(column - 1, y), right = rgb(column + 1, y)
            return !rgb(column, y).every((value, c) => value >= Math.min(left[c], right[c]) - 2 && value <= Math.max(left[c], right[c]) + 2)
        })
        if (offWall.length) {
            failures.push(`${backend}: in the measured program the center column looks at a lit wall through voxel edges, and ${offWall.length} of its ${wallRows.length} pixels there show another face, such as ${whole.pixel(wholeFrame, column, offWall[0])}`)
        }
        centerColumns[backend] = rows.map(y => whole.pixel(wholeFrame, column, y)).join(' ')
        assert.deepEqual(whole.errors, [], `${backend} console errors`)
        await whole.page.close()

        // Orthographic view, on every compiler. Where the pixels on both sides
        // of the center column look at the cliff face, so does the column.
        const center = await openRenderer(backend, centerCliff)
        const centerFrame = await center.showCliff(centerCliff)
        const middle = (centerCliff.width - 1) / 2
        const faceRows = Array.from({ length: centerCliff.height }, (_, y) => y).filter(y =>
            center.pixel(centerFrame, middle - 1, y) === WHITE && center.pixel(centerFrame, middle + 1, y) === WHITE)
        assert.ok(faceRows.length > 8, `${backend}: the center column must cross the lit cliff face`)
        const offFace = faceRows.filter(y => center.pixel(centerFrame, middle, y) !== WHITE)
        if (offFace.length) {
            failures.push(`${backend}: the center column looks at the lit cliff face through voxel edges, and ${offFace.length} of its ${faceRows.length} pixels there show ${center.pixel(centerFrame, middle, offFace[0])}`)
        }
        assert.deepEqual(center.errors, [], `${backend} console errors`)
        await center.page.close()

        // Perspective view, on every compiler. The diagonal pixels look at the
        // cliff face through its voxel edges; the pixels beside them do not.
        const diagonal = await openRenderer(backend, diagonalCliff)
        const diagonalFrame = await diagonal.showCliff(diagonalCliff)
        for (const at of [92, 96, 100]) {
            const beside = [diagonal.pixel(diagonalFrame, at - 1, at), diagonal.pixel(diagonalFrame, at + 1, at)]
            assert.deepEqual(beside, [WHITE, WHITE], `${backend}: the pixels beside ${at},${at} must look at the lit cliff face`)
            const onEdge = diagonal.pixel(diagonalFrame, at, at)
            if (onEdge !== WHITE) failures.push(`${backend}: pixel ${at},${at} looks at the lit cliff face through a voxel edge, and shows ${onEdge}`)
        }
        assert.deepEqual(diagonal.errors, [], `${backend} console errors`)
        await diagonal.page.close()
    }
    if (centerColumns.webgpu !== centerColumns.webgl2) {
        failures.push('both backends must show the same center column in the measured program')
    }
    assert.deepEqual(failures, [])
    console.log('PASS a voxel ray through an edge shows the face the neighboring voxels leave exposed, in both views and on both backends')
} finally {
    await browser.close(); await releaseServer()
}
