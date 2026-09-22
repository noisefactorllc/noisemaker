import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer, checkEffectStructure } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = new Map()
const artifacts = process.env.LANDSCAPE_ISOSURFACE_ARTIFACTS
if (artifacts) fs.mkdirSync(artifacts, { recursive: true })
const terrain = 'heightmap3d(heightTex: testPattern(pattern: gradient), tex: solid(color: #00ffff), volumeSize: x16, heightScale: 0.6, baseHeight: 0.1)'
const alpha = frame => frame.color.filter((_, i) => i % 4 === 3)
const hitCount = frame => alpha(frame).filter(v => v > 0).length

try {
    for (const backend of ['webgl2', 'webgpu']) {
        const page = await browser.newPage()
        const errors = []
        page.on('pageerror', e => errors.push(e.message))
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
        await page.setContent('<link rel="icon" href="data:,"><canvas width="96" height="80"></canvas>')
        await page.evaluate(async ({ baseUrl, backend }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            window.r = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 96, height: 80,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await r.loadManifest()
            await r.loadEffects(['synth/testPattern', 'synth/solid', 'synth3d/heightmap3d',
                'synth3d/shape3d', 'synth3d/noise3d', 'filter3d/palette3d', 'render/renderLandscape3d'])
        }, { baseUrl, backend })
        async function frame(name, view, filtering, source = terrain, extra = '', rotateX = 0.62) {
            const dsl = `search synth, synth3d, filter3d, render\n${source}.renderLandscape3d(viewMode: ${view}, bgAlpha: 0, rotateX: ${rotateX}, rotateY: 0.5, posY: 12${filtering ? `, filtering: ${filtering}` : ''}${extra}).write(o0)\nrender(o0)`
            const result = await page.evaluate(async dsl => {
                try { await r.compile(dsl) } catch (error) { throw new Error(JSON.stringify(error)) }
                r.stop(); r.render(0); r.render(0)
                await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
                const pass = r.pipeline.graph.passes.find(p => p.effectFunc === 'renderLandscape3d')
                const program = r.pipeline.backend.programs.get(pass.program)
                const color = await r.pipeline.backend.readPixels(pass.outputs.color)
                const geo = await r.pipeline.backend.readPixels(pass.outputs.geoOut)
                // Normalize the opposite row orders of these internal pass textures.
                const pixels = frame => {
                    const rows = Array.from({ length: frame.height }, (_, y) =>
                        Array.from(frame.data.slice(y * frame.width * 4, (y + 1) * frame.width * 4)))
                    if (r.pipeline.backend.getName().toLowerCase() === 'webgl2') rows.reverse()
                    return rows.flat()
                }
                return { backend: r.pipeline.backend.getName().toLowerCase(),
                    defines: r.pipeline.graph.programs[pass.program].defines,
                    uniforms: program.uniforms ? Object.keys(program.uniforms) : program.packedUniformLayout.layout.map(f => f.name),
                    color: pixels(color), geo: pixels(geo) }
            }, dsl)
            assert.equal(result.backend, backend)
            assert.equal(result.defines.FILTERING, filtering === 'isosurface' ? 0 : 1,
                'filtering must specialize the shader, including the legacy default')
            assert.equal(result.defines.VIEW_MODE, view === 'ortho' ? 1 : 2)
            assert.ok(!result.uniforms.includes('filtering'), 'filtering must not branch on a runtime uniform')
            if (artifacts) fs.writeFileSync(path.join(artifacts, `${backend}-${name}.png`),
                PNG.sync.write({ width: 96, height: 80, data: Buffer.from(result.color) }))
            if (backend === 'webgl2') captures.set(name, result)
            else {
                for (const channel of ['color', 'geo']) {
                    const reference = captures.get(name)[channel]
                    const maxDelta = result[channel].reduce((max, value, i) => Math.max(max, Math.abs(value - reference[i])), 0)
                    // Terrain fixtures require exact pixels. Procedural volume
                    // chains allow one RGBA8 quantization level, with exact coverage.
                    const epsilon = /^(shape3d|noise3d)\(/.test(source) ? 1 : 0
                    const mismatch = result[channel].findIndex((value, i) => Math.abs(value - reference[i]) > epsilon)
                    assert.ok(maxDelta <= epsilon, `${name} ${channel}: backend parity delta ${maxDelta}; first mismatch ${mismatch}: ${reference[mismatch]} vs ${result[channel][mismatch]}`)
                }
                assert.deepEqual(alpha(result), alpha(captures.get(name)), `${name}: backend coverage must match exactly`)
            }
            return result
        }
        for (const view of ['ortho', 'perspective']) {
            const voxel = await frame(`${view}-voxel`, view, 'voxel')
            const legacy = await frame(`${view}-default`, view)
            assert.deepEqual(legacy.color, voxel.color, 'existing programs must keep voxel pixels')
            assert.deepEqual(legacy.geo, voxel.geo)
            const iso = await frame(`${view}-iso`, view, 'isosurface')
            assert.ok(hitCount(iso) > 100, 'isosurface must render visible geometry')
            assert.notDeepEqual(iso.color, voxel.color, 'isosurface must change the staircase shading')
            assert.notDeepEqual(iso.geo, voxel.geo, 'isosurface must write smooth normals and refined depth')
            const smoothNormals = iso.geo.filter((v, i) => i % 4 !== 3 && iso.color[i - i % 4 + 3] > 0 &&
                v > 5 && v < 250 && Math.abs(v - 128) > 5)
            assert.ok(smoothNormals.length > 100, 'smooth normals must not stay axis aligned')
            const black = await frame(`${view}-black`, view, 'isosurface', terrain.replace('#00ffff', '#000000'), ', ambient: 1, diffuseIntensity: 0, specularIntensity: 0')
            assert.deepEqual(alpha(black), alpha(iso), 'black diffuse texels must not remove geometry')
            assert.deepEqual(black.geo, iso.geo, 'geometry must be independent of diffuse color')
            assert.ok(black.color.every((v, i) => i % 4 === 3 || v === 0), 'unlit black diffuse must remain black')
            for (const threshold of [0, 0.2, 0.5, 0.8, 1]) {
                const white = await frame(`${view}-white-${threshold}`, view, 'isosurface',
                    'heightmap3d(heightTex: solid(color: #ffffff), tex: solid(color: #ffffff), volumeSize: x16, heightScale: 0.5)',
                    `, threshold: ${threshold}, ambient: 1, diffuseIntensity: 0, specularIntensity: 0`)
                assert.ok(hitCount(white) > 100, 'white heightfield must render')
                assert.ok(white.color.every((v, i) => white.color[i - i % 4 + 3] === 0 || v === 255),
                    'empty voxels must not dim constant diffuse color at any threshold')
            }
            if (view === 'perspective') {
                // These rays refine very close to the empty side of a slab.
                // Vary the camera so boundary arithmetic is not GPU-specific.
                for (const rotateX of [0.207, 0.214, 0.228, 0.543, 0.627]) {
                    const white = await frame(`${view}-white-boundary-${rotateX}`, view, 'isosurface',
                        'heightmap3d(heightTex: solid(color: #ffffff), tex: solid(color: #ffffff), volumeSize: x16, heightScale: 0.5)',
                        ', threshold: 0, ambient: 1, diffuseIntensity: 0, specularIntensity: 0', rotateX)
                    assert.ok(hitCount(white) > 100, 'boundary fixture must render')
                    assert.ok(white.color.every((v, i) => white.color[i - i % 4 + 3] === 0 || v === 255),
                        `threshold-zero surface must retain white material at rotateX ${rotateX}`)
                }
            }
            const paletteSource = 'heightmap3d(heightTex: solid(color: #ffffff), tex: solid(color: #3399cc), volumeSize: x16, heightScale: 0.5).palette3d(index: palette.vaporwave)'
            const unlit = ', ambient: 1, diffuseIntensity: 0, specularIntensity: 0'
            const paletteVoxel = await frame(`${view}-palette-voxel`, view, 'voxel', paletteSource, unlit)
            const firstHit = alpha(paletteVoxel).findIndex(v => v > 0) * 4
            const expectedColor = paletteVoxel.color.slice(firstHit, firstHit + 4)
            for (const threshold of [0.2, 0.5, 0.8]) {
                const paletteIso = await frame(`${view}-palette-iso-${threshold}`, view, 'isosurface', paletteSource,
                    `${unlit}, threshold: ${threshold}`)
                assert.ok(hitCount(paletteIso) > 100, 'recolored heightfield must render')
                assert.ok(paletteIso.color.every((v, i) => paletteIso.color[i - i % 4 + 3] === 0 || v === expectedColor[i % 4]),
                    'palette colors written into empty voxels must not tint the surface')
            }
            const low = await frame(`${view}-low-threshold`, view, 'isosurface', terrain, ', threshold: 0.2')
            const high = await frame(`${view}-high-threshold`, view, 'isosurface', terrain, ', threshold: 0.8')
            assert.notDeepEqual(low.geo, high.geo, 'threshold must move the interpolated surface')
            for (const threshold of [0, 1]) {
                const empty = await frame(`${view}-empty-${threshold}`, view, 'isosurface',
                    'heightmap3d(volumeSize: x16, heightScale: 0)', `, threshold: ${threshold}`)
                assert.equal(hitCount(empty), 0, 'empty geometry must stay empty at threshold endpoints')
                const full = await frame(`${view}-full-${threshold}`, view, 'isosurface',
                    'heightmap3d(heightTex: solid(color: #ffffff), tex: solid(color: #00ffff), volumeSize: x16, heightScale: 1)', `, threshold: ${threshold}`)
                assert.ok(hitCount(full) > 100, 'solid volume must hit its bounding faces at threshold endpoints')
            }
            for (const source of ['shape3d', 'noise3d']) {
                assert.ok(hitCount(await frame(`${view}-${source}`, view, 'isosurface', `${source}(volumeSize: x16)`)) > 100,
                    `${source} continuous density must be supported`)
            }
            assert.deepEqual((await frame(`${view}-restored`, view, 'voxel')).color, voxel.color,
                'switching filtering back must restore voxel output')
        }
        assert.deepEqual(errors, [], `${backend}: browser errors`)
        await page.close()
        console.log(`PASS ${backend}: landscape filtering, geometry, thresholds, switching and pruning`)
    }
    const structure = await checkEffectStructure('render/renderLandscape3d')
    assert.equal(structure.status, 'ok', JSON.stringify(structure))
} finally {
    await browser.close()
    await releaseServer()
}
