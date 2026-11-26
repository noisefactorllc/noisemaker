#!/usr/bin/env node
// Portable packages as files, rendered on the GPU: the fixture packages under
// fixtures/portable/packages/ load with shaders/src/portable/package.js, keep
// every file's bytes, register through registerPortableEffect and render on
// WebGL2 and WebGPU. Each package covers one feature, and its frame must equal
// the frame its shaders define, byte for byte, on each backend:
//   split-points  a points pass with split GLSL stages (.vert and .frag) and
//                 one WGSL program: the grid of points at known pixels
//   mesh-asset    a triangles pass over global_mesh0_positions and normals,
//                 with the mesh uploaded from the package's assets/mesh.obj:
//                 the mesh covers the centre, coloured by its normal
//   volume-work   a volume atlas sized by volumeSize and handed on as
//                 outputTex3d, read by a second pass: each slice of the volume
//                 reaches the output
//   mrt-dynamic   one pass writing two textures sized by screenDivide, then a
//                 pass combining them: red from one target, green from the other
//   compute-storage  a compute pass writing a texture the effect declares
//                 through a storage binding, then a compute pass reading it and
//                 writing outputTex through one, with a fragment form of each
//                 for WebGL2: each pixel's position times spacing reaches the output
// The two backends' frames must also agree exactly, compared in texture row
// order. The package loader's GPU-free tests are in test_portable_package.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { isReadbackPerformanceWarning } from '../../scripts/lib/shader-parity-attestation.mjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { loadPortablePackage, packageFiles } from '../src/portable/package.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packagesDir = path.join(root, 'shaders/tests/fixtures/portable/packages')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')

const SIZE = 64
const BACKENDS = [
    { backend: 'webgl2', name: 'WebGL2', preferWebGPU: false },
    { backend: 'webgpu', name: 'WebGPU', preferWebGPU: true },
]
const BACKGROUND = [0, 0, 0, 255]
const program = call => `search user\n${call}.write(o0)\nrender(o0)`

// Each fixture's frame, as a function of the pixel (x, y) in texture rows:
// row y is the one gl_FragCoord.y and @builtin(position).y place at y + 0.5.
const FIXTURES = [
    {
        id: 'split-points',
        func: 'splitPoints',
        dsl: program('splitPoints()'),
        // Point (column, row) at pixel (8 + 16 * column, 8 + 16 * row).
        expected(x, y) {
            if (x % 16 !== 8 || y % 16 !== 8) return BACKGROUND
            return [Math.round((x >> 4) / 3 * 255), Math.round((y >> 4) / 3 * 255), 255, 255]
        },
        check(frame) {
            const points = countPixels(frame, pixel => pixel[2] === 255)
            assert.equal(points, 16, `the grid draws one pixel per point, found ${points}`)
            return { points }
        },
    },
    {
        id: 'mesh-asset',
        func: 'meshAsset',
        dsl: program('meshAsset()'),
        mesh: 'assets/mesh.obj',
        // The square (-0.5, -0.5) to (0.5, 0.5) covers pixels 16 to 47 on each
        // axis, coloured by its normal (0, 0, 1).
        expected(x, y) {
            return x >= 16 && x < 48 && y >= 16 && y < 48 ? [0, 0, 255, 255] : BACKGROUND
        },
        check(frame) {
            const covered = countPixels(frame, pixel => pixel[2] === 255)
            assert.deepEqual(pixelAt(frame, SIZE / 2, SIZE / 2), [0, 0, 255, 255], 'the mesh covers the centre')
            assert.equal(covered, 32 * 32, `the mesh covers its square, found ${covered} pixels`)
            return { covered }
        },
    },
    {
        id: 'volume-work',
        func: 'volumeWork',
        dsl: program('volumeWork(volumeSize: 16)'),
        textures: { volume: { fragColor: [16, 256] } },
        // Slice z is the tile (z % 4, z / 4); voxel (x, y, z) is (x, y, z) / 15.
        expected(x, y) {
            const z = (y >> 4) * 4 + (x >> 4)
            return [17 * (x % 16), 17 * (y % 16), 17 * z, 255]
        },
        check(frame) {
            const slices = new Set()
            for (let y = 0; y < SIZE; y += 16) for (let x = 0; x < SIZE; x += 16) slices.add(pixelAt(frame, x, y)[2])
            assert.equal(slices.size, 16, `every slice of the volume reaches the output, found ${slices.size}`)
            return { slices: slices.size }
        },
    },
    {
        id: 'mrt-dynamic',
        func: 'mrtDynamic',
        dsl: program('mrtDynamic(zoom: 8)'),
        // The screen divided by zoom: 8 x 8 cells, each 8 pixels square.
        textures: { cells: { columns: [8, 8], rows: [8, 8] } },
        expected(x, y) {
            return [8 * (x >> 3), 8 * (y >> 3), 255, 255]
        },
        check(frame) {
            const reds = new Set()
            const greens = new Set()
            for (let i = 0; i < frame.data.length; i += 4) {
                reds.add(frame.data[i])
                greens.add(frame.data[i + 1])
            }
            assert.equal(reds.size, 8, `the first target gives each column of cells its red, found ${reds.size} reds`)
            assert.equal(greens.size, 8, `the second target gives each row of cells its green, found ${greens.size} greens`)
            return { reds: reds.size, greens: greens.size }
        },
    },
    {
        id: 'compute-storage',
        func: 'computeStorage',
        dsl: program('computeStorage(spacing: 3)'),
        // The work texture holds (3x, 3y) out of 255 at pixel (x, y); the
        // output keeps it and adds the complement of red in blue.
        expected(x, y) {
            return [3 * x, 3 * y, 255 - 3 * x, 255]
        },
        check(frame) {
            assert.deepEqual(pixelAt(frame, SIZE - 1, SIZE - 1), [189, 189, 66, 255],
                'the spacing parameter reaches the first compute pass, and its storage write reaches the output')
            const reds = new Set()
            for (let x = 0; x < SIZE; x++) reds.add(pixelAt(frame, x, 0)[0])
            assert.equal(reds.size, SIZE, `every column of the work texture reaches the output, found ${reds.size}`)
            return { columns: reds.size }
        },
    },
]

function pixelAt(frame, x, y) {
    const offset = (y * frame.width + x) * 4
    return Array.from(frame.data.subarray(offset, offset + 4))
}

function countPixels(frame, predicate) {
    let count = 0
    for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) if (predicate(pixelAt(frame, x, y))) count++
    }
    return count
}

// A package directory as a file map: package paths to bytes.
function readPackage(directory, prefix = '', files = new Map()) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) readPackage(path.join(directory, entry.name), name, files)
        else files.set(name, new Uint8Array(fs.readFileSync(path.join(directory, entry.name))))
    }
    return files
}

function assertSameFiles(actual, expected, label) {
    assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), `${label}: the same paths`)
    for (const [name, bytes] of expected) {
        assert.ok(Buffer.from(actual.get(name)).equals(Buffer.from(bytes)), `${label}: ${name} keeps its bytes`)
    }
}

// WebGL2Backend.readPixels() turns the rows over, top row first; the WebGPU
// backend returns them as the texture holds them. Both come back here in
// texture row order.
function textureRows(capture) {
    const data = new Uint8Array(capture.data)
    if (capture.backend !== 'WebGL2') return { width: capture.width, height: capture.height, data }
    const rowBytes = capture.width * 4
    const rows = new Uint8Array(data.length)
    for (let y = 0; y < capture.height; y++) {
        rows.set(data.subarray((capture.height - 1 - y) * rowBytes, (capture.height - y) * rowBytes), y * rowBytes)
    }
    return { width: capture.width, height: capture.height, data: rows }
}

function compareFrames(a, b) {
    let mismatchedPixels = 0
    let maxChannelDiff = 0
    const samples = []
    for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
            const left = pixelAt(a, x, y)
            const right = pixelAt(b, x, y)
            const diff = Math.max(...left.map((value, channel) => Math.abs(value - right[channel])))
            if (diff === 0) continue
            mismatchedPixels++
            maxChannelDiff = Math.max(maxChannelDiff, diff)
            if (samples.length < 8) samples.push({ x, y, got: left, expected: right })
        }
    }
    return { mismatchedPixels, maxChannelDiff, samples }
}

function expectedFrame(fixture) {
    const data = new Uint8Array(SIZE * SIZE * 4)
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) data.set(fixture.expected(x, y), (y * SIZE + x) * 4)
    }
    return { width: SIZE, height: SIZE, data }
}

// In the page: load the package from its files, register it, compile and
// render at time 0, and read o0. Runs in a fresh realm for each package, as
// registries are shared within one.
async function renderInPage({ baseUrl, entries, backend, preferWebGPU, dsl, func, mesh, size, textures }) {
    const { loadPortablePackage, packageFiles } = await import(`${baseUrl}/shaders/src/portable/package.js`)
    const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
    const files = new Map(entries.map(([name, bytes]) => [name, new Uint8Array(bytes)]))
    const loaded = loadPortablePackage(files, { backend })
    if (loaded.diagnostics.length > 0) throw new Error(`the page's loader refused the package: ${JSON.stringify(loaded.diagnostics)}`)
    const copied = packageFiles(loaded)
    for (const [name, bytes] of files) {
        const copy = copied.get(name)
        if (!copy || copy.length !== bytes.length || copy.some((value, index) => value !== bytes[index])) {
            throw new Error(`the page's loader changed ${name}`)
        }
    }

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    document.body.appendChild(canvas)
    const renderer = new CanvasRenderer({ canvas, width: size, height: size, basePath: `${baseUrl}/shaders`, preferWebGPU })
    await renderer.registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders })
    await renderer.compile(dsl)
    renderer.stop()
    await renderer.render(0)
    let meshVertices = null
    if (mesh) {
        const result = await renderer.loadOBJFromString(new TextDecoder().decode(loaded.assets.get(mesh)), 'mesh0')
        if (!result.success) throw new Error(`the mesh asset did not load: ${result.error}`)
        meshVertices = result.vertexCount
    }
    await renderer.render(0)
    await renderer.render(0)
    const pipeline = renderer.pipeline
    await pipeline.backend.device?.queue?.onSubmittedWorkDone?.()

    const passes = pipeline.graph.passes.filter(pass => pass.effectFunc === func)
    const sizes = {}
    for (const [passName, outputs] of Object.entries(textures || {})) {
        const pass = passes.find(candidate => candidate.name === passName)
        if (!pass) throw new Error(`no ${passName} pass in the graph`)
        sizes[passName] = {}
        for (const output of Object.keys(outputs)) {
            const texture = pipeline.backend.textures.get(pass.outputs[output])
            sizes[passName][output] = texture ? [texture.width, texture.height] : null
        }
    }
    const pixels = await pipeline.backend.readPixels(pipeline.surfaces.get('o0').read)
    return {
        backend: pipeline.backend.getName(),
        passes: passes.map(pass => pass.name),
        meshVertices,
        sizes,
        width: pixels.width,
        height: pixels.height,
        data: Array.from(pixels.data),
    }
}

async function renderFixture(browser, baseUrl, fixture, files, { backend, name, preferWebGPU }) {
    const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
    const messages = []
    page.on('console', message => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (message.type() === 'error' || message.type() === 'warning') messages.push(`[${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', error => messages.push(`[pageerror] ${error.message}`))
    try {
        await page.goto(`${baseUrl}/shaders/tests/blank.html`)
        const capture = await page.evaluate(renderInPage, {
            baseUrl,
            entries: [...files].map(([path, bytes]) => [path, Array.from(bytes)]),
            backend,
            preferWebGPU,
            dsl: fixture.dsl,
            func: fixture.func,
            mesh: fixture.mesh ?? null,
            size: SIZE,
            textures: fixture.textures ?? null,
        })
        assert.equal(capture.backend, name, `${fixture.id} must run on ${name}`)
        assert.deepEqual(messages, [], `${fixture.id} on ${name}: browser console:\n${messages.join('\n')}`)
        return capture
    } finally {
        await page.close()
    }
}

test('the fixture packages load for each backend and keep every file byte for byte', () => {
    for (const fixture of FIXTURES) {
        const files = readPackage(path.join(packagesDir, fixture.id))
        for (const { backend } of BACKENDS) {
            const loaded = loadPortablePackage(files, { backend })
            assert.deepEqual(loaded.diagnostics, [], `${fixture.id} on ${backend}`)
            assert.equal(loaded.profile, 'v2', `${fixture.id} is a version 2 package`)
            assertSameFiles(packageFiles(loaded), files, `${fixture.id} on ${backend}`)
        }
    }
    const mesh = loadPortablePackage(readPackage(path.join(packagesDir, 'mesh-asset')))
    assert.deepEqual([...mesh.assets.keys()].sort(), ['assets/lut.bin', 'assets/mesh.obj'])
    const lut = mesh.assets.get('assets/lut.bin')
    assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(lut), 'assets/lut.bin is binary, not text')
    assert.ok(Buffer.from(lut).equals(fs.readFileSync(path.join(packagesDir, 'mesh-asset/assets/lut.bin'))), 'the binary asset keeps its bytes')
    const split = loadPortablePackage(readPackage(path.join(packagesDir, 'split-points')))
    assert.ok(split.shaders.points.vertex && split.shaders.points.fragment && !split.shaders.points.glsl, 'points has split GLSL stages')
})

test('the fixture packages render on WebGL2 and WebGPU', async t => {
    const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
    const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
    let browser
    try {
        browser = await chromium.launch(shaderTestBrowserOptions())
        for (const fixture of FIXTURES) {
            await t.test(fixture.id, async () => {
                const files = readPackage(path.join(packagesDir, fixture.id))
                const expected = expectedFrame(fixture)
                const declared = Object.keys(JSON.parse(new TextDecoder().decode(files.get('definition.json'))).passes)
                const frames = {}
                for (const target of BACKENDS) {
                    const capture = await renderFixture(browser, baseUrl, fixture, files, target)
                    const label = `${fixture.id} on ${target.name}`
                    assert.deepEqual(capture.passes, declared, `${label}: every pass of the package executes`)
                    if (fixture.mesh) assert.ok(capture.meshVertices > 0, `${label}: the mesh asset uploads`)
                    if (fixture.textures) assert.deepEqual(capture.sizes, fixture.textures, `${label}: texture sizes follow the parameter`)
                    assert.equal(capture.width, SIZE, `${label}: frame width`)
                    assert.equal(capture.height, SIZE, `${label}: frame height`)
                    const frame = textureRows(capture)
                    const summary = fixture.check(frame)
                    const difference = compareFrames(frame, expected)
                    assert.equal(difference.mismatchedPixels, 0,
                        `${label}: the frame its shaders define, exactly: ${JSON.stringify(difference)}`)
                    frames[target.backend] = frame
                    console.log(`${label}: ${JSON.stringify(summary)}, matches the expected frame`)
                }
                const parity = compareFrames(frames.webgl2, frames.webgpu)
                console.log(`${fixture.id}: WebGL2 and WebGPU differ in ${parity.mismatchedPixels} pixels, max channel difference ${parity.maxChannelDiff}`)
                assert.equal(parity.mismatchedPixels, 0, `${fixture.id}: WebGL2 and WebGPU agree exactly: ${JSON.stringify(parity)}`)
            })
        }
    } finally {
        await browser?.close()
        await releaseServer()
    }
})
