import assert from 'node:assert/strict'
import { CanvasRenderer, mergeIntoEnums, stdEnums } from '../src/index.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'

mergeIntoEnums(stdEnums)
const renderer = new CanvasRenderer()
for (const id of ['synth3d/heightmap3d', 'filter3d/palette3d', 'render/renderLandscape3d']) {
    const [namespace, name] = id.split('/')
    const { default: instance } = await import(`../effects/${id}/definition.js`)
    const effect = { namespace, name, instance }
    mergeIntoEnums(renderer.registerEffectWithRuntime(effect))
    renderer.registerStarterOpForEffect(effect)
}

// Exercise real graph expansion and texture allocation without requiring a GPU.
class TextureBackend {
    textures = new Map()
    createTexture(id, spec) { this.textures.set(id, { ...spec }) }
    destroyTexture(id) { this.textures.delete(id) }
}
const graph = compileGraph(`search synth3d, filter3d, render
heightmap3d(volumeSize: x16).write3d(vol0, geo0)
heightmap3d(volumeSize: x32).write3d(vol1, geo1)
read3d(vol0, geo0).palette3d().renderLandscape3d().write(o0)
read3d(vol1, geo1).palette3d().renderLandscape3d().write(o1)
render(o0)`)
const pipeline = new Pipeline(graph, new TextureBackend())
pipeline.width = 192
pipeline.height = 128
pipeline.createSurfaces()
pipeline.recreateTextures(pipeline.collectDefaultUniforms())
renderer._pipeline = pipeline

function size(id, expected) {
    const texture = pipeline.backend.textures.get(id)
    assert.ok(texture, `missing texture ${id}`)
    assert.deepEqual([texture.width, texture.height], expected, id)
}
function checkExports(firstSize, secondSize) {
    for (const [index, n] of [firstSize, secondSize].entries()) {
        for (const surface of ['vol', 'geo']) for (const buffer of ['read', 'write']) {
            size(`global_${surface}${index}_${buffer}`, [n, n * n])
        }
        for (const buffer of ['read', 'write']) size(`global_o${index}_${buffer}`, [192, 128])
    }
    const filters = graph.passes.filter(p => p.effectFunc === 'palette3d')
    for (const [i, filter] of filters.entries()) {
        const n = [firstSize, secondSize][i]
        size(filter.outputs.fragColor, [n, n * n])
        assert.equal(filter.uniforms.volumeSize, n, 'reader filter must inherit its own volume size')
    }
    const views = graph.passes.filter(p => p.effectFunc === 'renderLandscape3d')
    assert.deepEqual(views.map(p => p.uniforms.volumeSize), [firstSize, secondSize])
}
checkExports(16, 32)

const firstSource = graph.passes.find(p => p.effectFunc === 'heightmap3d')
renderer.applyStepParameterValues({ [`step_${firstSource.stepIndex}`]: { volumeSize: 64 } })
checkExports(64, 32)
renderer.applyStepParameterValues({ [`step_${firstSource.stepIndex}`]: { volumeSize: 16 } })
checkExports(16, 32)

// Recreating display surfaces must leave exported atlases at their volume dimensions.
pipeline.width = 320
pipeline.height = 180
pipeline.createSurfaces()
pipeline.recreateTextures(pipeline.collectDefaultUniforms())
size('global_geo0_read', [16, 256])
size('global_vol1_read', [32, 1024])
size('global_o0_read', [320, 180])

// Readers before their writers use the previous frame, but the same atlas layout.
const feedbackGraph = compileGraph(`search synth3d, filter3d, render
read3d(vol1, geo1).palette3d().renderLandscape3d().write(o0)
read3d(vol0, geo0).write3d(vol1, geo1)
heightmap3d(volumeSize: x16).write3d(vol0, geo0)
render(o0)`)
const feedbackPipeline = new Pipeline(feedbackGraph, new TextureBackend())
feedbackPipeline.width = 192
feedbackPipeline.height = 128
feedbackPipeline.createSurfaces()
feedbackPipeline.recreateTextures(feedbackPipeline.collectDefaultUniforms())
const feedbackFilter = feedbackGraph.passes.find(p => p.effectFunc === 'palette3d')
assert.equal(feedbackFilter.uniforms.volumeSize, 16, 'forward readers and relays must resolve the final producer size')
for (const name of ['vol0', 'geo0', 'vol1', 'geo1']) {
    const texture = feedbackPipeline.backend.textures.get(`global_${name}_read`)
    assert.deepEqual([texture.width, texture.height], [16, 256], `${name} forward atlas`)
}

// A filter that rewrites its input surface must retain the original producer scope.
const rewriteGraph = compileGraph(`search synth3d, filter3d, render
heightmap3d(volumeSize: x16).write3d(vol0, geo0)
read3d(vol0, geo0).palette3d().write3d(vol0, geo0)
read3d(vol0, geo0).palette3d().write3d(vol0, geo0)
read3d(vol0, geo0).renderLandscape3d().write(o0)
render(o0)`)
const rewritePipeline = new Pipeline(rewriteGraph, new TextureBackend())
rewritePipeline.width = 192
rewritePipeline.height = 128
rewritePipeline.createSurfaces()
rewritePipeline.recreateTextures(rewritePipeline.collectDefaultUniforms())
renderer._pipeline = rewritePipeline
const rewriteSource = rewriteGraph.passes.find(p => p.effectFunc === 'heightmap3d')
for (const n of [16, 32, 16]) {
    renderer.applyStepParameterValues({ [`step_${rewriteSource.stepIndex}`]: { volumeSize: n } })
    for (const pass of rewriteGraph.passes.filter(p => p.effectFunc === 'palette3d' || p.effectFunc === 'renderLandscape3d')) {
        assert.equal(pass.uniforms.volumeSize, n, 'same-surface rewrites must follow live producer sizing')
    }
    for (const surface of ['vol0', 'geo0']) for (const buffer of ['read', 'write']) {
        const texture = rewritePipeline.backend.textures.get(`global_${surface}_${buffer}`)
        assert.deepEqual([texture.width, texture.height], [n, n * n], `${surface} rewritten atlas`)
    }
}
console.log('PASS native volume exports preserve atlas dimensions, size inheritance, live updates and chain isolation')
