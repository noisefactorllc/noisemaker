/**
 * Regression test for per-effect zoom in multi-chain DSL.
 *
 * Bug: Simulation effects (reactionDiffusion, cellularAutomata, mnca) declare
 *      `screenDivide:'zoom'` for their state textures. The expander correctly
 *      scopes per chain (zoom_chain_N), but three downstream paths overrode
 *      the per-chain values with a single pipeline-wide zoom — so the second
 *      reactionDiffusion in a DSL ended up sized by the first one's zoom.
 *
 * What this test guards:
 *   - Compile time: per-chain texture dimensions match each chain's own zoom.
 *   - Runtime UI updates via applyStepParameterValues: changing one chain's
 *     zoom resizes only that chain's simulation surface.
 *   - Runtime UI updates via applyParameterValues (single-effect mode):
 *     same expectation.
 *
 * Run:  node shaders/tests/test_zoom_per_chain.js
 */

import { CanvasRenderer } from '../src/renderer/canvas.js'
import {
    registerEffect, registerOp, registerStarterOps,
    mergeIntoEnums, stdEnums
} from '../src/index.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'

mergeIntoEnums(stdEnums)

let passed = 0
let failed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (err) {
        console.error(`FAIL: ${name}`)
        console.error(err)
        failed++
    }
}

async function loadEffect(file, namespace, name) {
    const mod = await import(file)
    const def = mod.default
    const instance = (typeof def === 'function') ? new def() : def
    registerEffect(instance.func, instance)
    registerEffect(`${namespace}.${instance.func}`, instance)
    registerEffect(`${namespace}/${name}`, instance)
    registerEffect(`${namespace}.${name}`, instance)

    const args = Object.entries(instance.globals || {}).map(([key, spec]) => {
        let enumPath = spec.enum || spec.enumPath
        if (spec.choices && !enumPath) enumPath = `${namespace}.${instance.func}.${key}`
        return {
            name: key,
            type: spec.type === 'vec4' ? 'color' : spec.type,
            default: spec.default,
            enum: enumPath,
            enumPath,
            min: spec.min,
            max: spec.max,
            uniform: spec.uniform,
            choices: spec.choices
        }
    })
    registerOp(`${namespace}.${instance.func}`, { name: instance.func, args })

    const isStarter = !((instance.passes || []).some(p =>
        p.inputs && Object.values(p.inputs).some(v =>
            ['inputTex', 'inputTex3d', 'src', 'o0', 'o1'].includes(v))))
    if (isStarter) registerStarterOps([`${namespace}.${instance.func}`])
    if (instance.enums) mergeIntoEnums(instance.enums)
    if (instance.globals) {
        const choicesEnum = {}
        for (const [key, spec] of Object.entries(instance.globals)) {
            if (spec.choices) {
                const inner = {}
                for (const [n, v] of Object.entries(spec.choices)) {
                    if (n.endsWith(':')) continue
                    inner[n] = { type: 'Number', value: v }
                }
                choicesEnum[key] = inner
            }
        }
        if (Object.keys(choicesEnum).length) {
            const top = { [namespace]: { [instance.func]: choicesEnum } }
            mergeIntoEnums(top)
        }
    }
}

await loadEffect(new URL('../effects/synth/reactionDiffusion/definition.js', import.meta.url).pathname, 'synth', 'reactionDiffusion')
await loadEffect(new URL('../effects/synth/cellularAutomata/definition.js', import.meta.url).pathname, 'synth', 'cellularAutomata')
await loadEffect(new URL('../effects/synth/perlin/definition.js', import.meta.url).pathname, 'synth', 'perlin')

class StubBackend {
    constructor() { this.textures = new Map() }
    createTexture(id, spec) { this.textures.set(id, { width: spec.width, height: spec.height, format: spec.format }) }
    destroyTexture(id) { this.textures.delete(id) }
}

const SCREEN = 1024

function buildPipeline(dsl) {
    const graph = compileGraph(dsl)
    const pipeline = new Pipeline(graph, new StubBackend())
    pipeline.width = SCREEN
    pipeline.height = SCREEN
    pipeline.createSurfaces()
    return { graph, pipeline }
}

function getSurfaceSize(pipeline, texId) {
    const tex = pipeline.backend.textures.get(`${texId}_read`)
    return tex ? `${tex.width}x${tex.height}` : null
}

function assertSize(pipeline, texId, expected, label) {
    const actual = getSurfaceSize(pipeline, texId)
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`)
    }
}

// ---------------------------------------------------------------------------

test('two reactionDiffusions with different zooms get distinct sizes', () => {
    const { pipeline } = buildPipeline(
        `search synth, filter
perlin().write(o0)
reactionDiffusion(zoom: x4, tex: read(o0)).write(o1)
reactionDiffusion(zoom: x16).write(o2)
render(o2)`
    )
    assertSize(pipeline, 'global_rd_state_chain_1', '256x256', 'first RD (zoom=x4)')
    assertSize(pipeline, 'global_rd_state_chain_2', '64x64',   'second RD (zoom=x16)')
})

test('cellularAutomata + reactionDiffusion get independent sizes', () => {
    const { pipeline } = buildPipeline(
        `search synth, filter
cellularAutomata(zoom: x4).write(o0)
reactionDiffusion(zoom: x16).write(o1)
render(o1)`
    )
    assertSize(pipeline, 'global_ca_state_chain_0', '256x256', 'CA (zoom=x4)')
    assertSize(pipeline, 'global_rd_state_chain_1', '64x64',   'RD (zoom=x16)')
})

test('single reactionDiffusion sized by its own zoom', () => {
    const { pipeline } = buildPipeline(
        `search synth, filter
reactionDiffusion(zoom: x8).write(o0)
render(o0)`
    )
    assertSize(pipeline, 'global_rd_state_chain_0', '128x128', 'single RD (zoom=x8)')
})

test('applyStepParameterValues resizes only the affected chain', () => {
    const { graph, pipeline } = buildPipeline(
        `search synth, filter
reactionDiffusion(zoom: x4).write(o0)
reactionDiffusion(zoom: x16).write(o1)
render(o1)`
    )
    assertSize(pipeline, 'global_rd_state_chain_0', '256x256', 'initial chain_0')
    assertSize(pipeline, 'global_rd_state_chain_1', '64x64',   'initial chain_1')

    // Find the stepIndex of the second RD via its scoped param name.
    const stepIndexFor = (chainScope) => {
        const pass = graph.passes.find(p => p.scopedParams && p.scopedParams.zoom === chainScope)
        if (!pass) throw new Error(`no pass with scoped zoom ${chainScope}`)
        return pass.stepIndex
    }
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline

    // RD#2: x16 -> x2, only chain_1 should resize.
    renderer.applyStepParameterValues({
        [`step_${stepIndexFor('zoom_chain_1')}`]: { zoom: 2 }
    })
    assertSize(pipeline, 'global_rd_state_chain_0', '256x256', 'chain_0 unchanged')
    assertSize(pipeline, 'global_rd_state_chain_1', '512x512', 'chain_1 resized')

    // RD#1: x4 -> x32, only chain_0 should resize.
    renderer.applyStepParameterValues({
        [`step_${stepIndexFor('zoom_chain_0')}`]: { zoom: 32 }
    })
    assertSize(pipeline, 'global_rd_state_chain_0', '32x32',   'chain_0 resized to x32')
    assertSize(pipeline, 'global_rd_state_chain_1', '512x512', 'chain_1 still at x2')
})

test('setUniform("zoom", N) resizes single-chain simulation surface (host-driven path)', () => {
    const { pipeline } = buildPipeline(
        `search synth, filter
cellularAutomata(zoom: x4).write(o0)
render(o0)`
    )
    assertSize(pipeline, 'global_ca_state_chain_0', '256x256', 'initial')
    pipeline.setUniform('zoom', 32)
    assertSize(pipeline, 'global_ca_state_chain_0', '32x32', 'after setUniform("zoom", 32)')
})

test('applyParameterValues (single-effect mode) resizes simulation surface', async () => {
    const { pipeline } = buildPipeline(
        `search synth, filter
reactionDiffusion(zoom: x4).write(o0)
render(o0)`
    )
    assertSize(pipeline, 'global_rd_state_chain_0', '256x256', 'initial')

    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline
    renderer._uniformBindings = new Map()

    // Use the same effect descriptor shape that loadEffectFromBundle / loadEffectDefinition
    // hand to applyParameterValues — buildUniformBindings then walks all RD passes.
    const rdMod = await import(new URL('../effects/synth/reactionDiffusion/definition.js', import.meta.url).pathname)
    const rdInstance = (typeof rdMod.default === 'function') ? new rdMod.default() : rdMod.default
    const effect = { instance: rdInstance, namespace: 'synth' }

    renderer.applyParameterValues(effect, { zoom: 8 })
    assertSize(pipeline, 'global_rd_state_chain_0', '128x128', 'resized to x8')
})

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
