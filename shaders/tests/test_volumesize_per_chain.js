/**
 * Regression test for per-effect volumeSize across multiple 3D chains.
 *
 * Bug: synth3d effects (noise3d, fractal3d, etc.) declare `volumeCache` and
 *      `geoBuffer` as node-local textures sized by `param: 'volumeSize'`. The
 *      expander didn't scope `param:` references on node-local textures, so
 *      two chains with different volumeSize collided on a single shared
 *      `volumeSize` lookup key — last write wins in collectDefaultUniforms.
 *
 *      The chain-internal inheritance (`cell3d().noise3d()` shares the
 *      upstream effect's volumeSize) is preserved by `pipelineUniforms`
 *      propagation through the chain; this test guards the cross-chain
 *      isolation that was broken.
 *
 * Run:  node shaders/tests/test_volumesize_per_chain.js
 */

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

await loadEffect(new URL('../effects/synth3d/noise3d/definition.js', import.meta.url).pathname, 'synth3d', 'noise3d')
await loadEffect(new URL('../effects/filter3d/flow3d/definition.js', import.meta.url).pathname, 'filter3d', 'flow3d')
await loadEffect(new URL('../effects/render/render3d/definition.js', import.meta.url).pathname, 'render', 'render3d')

class StubBackend {
    constructor() { this.textures = new Map() }
    createTexture(id, spec) { this.textures.set(id, { width: spec.width, height: spec.height, format: spec.format }) }
    createTexture3D(id, spec) { this.textures.set(id, { width: spec.width, height: spec.height, depth: spec.depth, format: spec.format }) }
    destroyTexture(id) { this.textures.delete(id) }
}

const SCREEN = 1024

function buildPipeline(dsl) {
    const graph = compileGraph(dsl)
    const pipeline = new Pipeline(graph, new StubBackend())
    pipeline.width = SCREEN
    pipeline.height = SCREEN
    pipeline.createSurfaces()
    pipeline.recreateTextures(pipeline.collectDefaultUniforms())
    return { graph, pipeline }
}

function getTexSize(pipeline, texId) {
    const tex = pipeline.backend.textures.get(texId)
    return tex ? `${tex.width}x${tex.height}` : null
}

function assertSize(pipeline, texId, expected, label) {
    const actual = getTexSize(pipeline, texId)
    if (actual !== expected) {
        throw new Error(`${label}: expected ${expected}, got ${actual}`)
    }
}

// ---------------------------------------------------------------------------

test('two noise3d chains with different volumeSize get distinct atlas sizes', () => {
    const { pipeline } = buildPipeline(
        `search synth3d, render
noise3d(volumeSize: x32).write3d(vol0, geo0)
noise3d(volumeSize: x128).write3d(vol1, geo1)
render(o0)`
    )
    // chain_0: volumeSize=32 → 32×1024 (32 slices of 32×32)
    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'first chain volumeCache')
    assertSize(pipeline, 'node_0_geoBuffer',   '32x1024', 'first chain geoBuffer')
    // chain_1: volumeSize=128 → 128×16384
    assertSize(pipeline, 'node_2_volumeCache', '128x16384', 'second chain volumeCache')
    assertSize(pipeline, 'node_2_geoBuffer',   '128x16384', 'second chain geoBuffer')
})

test('two noise3d chains with same volumeSize get equal atlas sizes', () => {
    const { pipeline } = buildPipeline(
        `search synth3d, render
noise3d(volumeSize: x64).write3d(vol0, geo0)
noise3d(volumeSize: x64).write3d(vol1, geo1)
render(o0)`
    )
    assertSize(pipeline, 'node_0_volumeCache', '64x4096', 'first chain (x64)')
    assertSize(pipeline, 'node_2_volumeCache', '64x4096', 'second chain (x64)')
})

test('chain-internal volumeSize propagates from source to downstream effect', () => {
    // noise3d().flow3d() — the user-asked propagation case. flow3d is non-starter
    // (takes inputTex3d), inherits noise3d's volumeSize via pipelineUniforms flow.
    // All node-local atlases AND global_ trail/blended/state must agree.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().write3d(vol0, geo0)
render(o0)`
    )
    // noise3d is node_0, flow3d is node_1.
    assertSize(pipeline, 'node_0_volumeCache',                '32x1024', 'noise3d node-local atlas')
    assertSize(pipeline, 'node_0_geoBuffer',                  '32x1024', 'noise3d node-local geo')
    assertSize(pipeline, 'node_1_volumeCache',                '32x1024', 'flow3d node-local atlas inherits')
    assertSize(pipeline, 'node_1_geoBuffer',                  '32x1024', 'flow3d node-local geo inherits')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read',  '32x1024', 'flow3d trail chain-scoped')
    assertSize(pipeline, 'global_flow3d_blended_chain_0_read','32x1024', 'flow3d blended chain-scoped')

    // Both effects' passes carry the chain-scoped variant set to 32.
    for (const pass of graph.passes) {
        if (pass.scopedParams && pass.scopedParams.volumeSize === 'volumeSize_chain_0') {
            if (pass.uniforms.volumeSize_chain_0 !== 32) {
                throw new Error(`pass ${pass.id}: volumeSize_chain_0 expected 32, got ${pass.uniforms.volumeSize_chain_0}`)
            }
        }
    }
})

test('two noise3d→flow3d chains with different volumeSize stay isolated', () => {
    // Two source→sink chains side by side. The second flow3d must NOT collide
    // with the first chain's volumeSize on either node-local OR global_ textures.
    const { pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().write3d(vol0, geo0)
noise3d(volumeSize: x128).flow3d().write3d(vol1, geo1)
render(o0)`
    )
    // chain_0 → all 32x1024, chain_1 → all 128x16384
    assertSize(pipeline, 'node_0_volumeCache',                  '32x1024',   'chain_0 noise3d atlas')
    assertSize(pipeline, 'node_1_volumeCache',                  '32x1024',   'chain_0 flow3d atlas')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read',    '32x1024',   'chain_0 flow3d trail')
    assertSize(pipeline, 'global_flow3d_blended_chain_0_read',  '32x1024',   'chain_0 flow3d blended')

    assertSize(pipeline, 'node_3_volumeCache',                  '128x16384', 'chain_1 noise3d atlas')
    assertSize(pipeline, 'node_4_volumeCache',                  '128x16384', 'chain_1 flow3d atlas')
    assertSize(pipeline, 'global_flow3d_trail_chain_1_read',    '128x16384', 'chain_1 flow3d trail')
    assertSize(pipeline, 'global_flow3d_blended_chain_1_read',  '128x16384', 'chain_1 flow3d blended')
})

test('full source→filter→renderer chain inherits volumeSize end-to-end', () => {
    // noise3d → flow3d → render3d. Renderer also uses volumeSize for its
    // raymarching screenGeoBuffer; verify everything in the chain agrees on
    // the source's volumeSize value.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x64).flow3d().render3d().write(o0)
render(o0)`
    )
    assertSize(pipeline, 'node_0_volumeCache', '64x4096', 'noise3d atlas')
    assertSize(pipeline, 'node_1_volumeCache', '64x4096', 'flow3d atlas inherits')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read', '64x4096', 'flow3d trail inherits')

    // render3d's pass.uniforms.volumeSize should equal 64 (inherited through chain)
    const renderPass = graph.passes.find(p => p.effectFunc === 'render3d')
    if (!renderPass) throw new Error('render3d pass not found')
    if (renderPass.uniforms.volumeSize !== 64) {
        throw new Error(`render3d pass.uniforms.volumeSize: expected 64, got ${renderPass.uniforms.volumeSize}`)
    }
    if (renderPass.uniforms.volumeSize_chain_0 !== 64) {
        throw new Error(`render3d pass.uniforms.volumeSize_chain_0: expected 64, got ${renderPass.uniforms.volumeSize_chain_0}`)
    }
})

test('setUniform("volumeSize", N) resizes single-chain atlas (host-driven path)', () => {
    // The docs viewer / MCP harness / foundry call pipeline.setUniform(name, value)
    // for legacy "set this for the pipeline" semantics. Single-chain DSLs are
    // the common case there; the fanout writes to the one chain-scoped variant.
    const { pipeline } = buildPipeline(
        `search synth3d, render
noise3d(volumeSize: x32).write3d(vol0, geo0)
render(o0)`
    )
    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'initial')
    pipeline.setUniform('volumeSize', 128)
    assertSize(pipeline, 'node_0_volumeCache', '128x16384', 'after setUniform("volumeSize", 128)')
})

test('chain-scoped param refs propagate per chain in pass uniforms', () => {
    const { graph } = buildPipeline(
        `search synth3d, render
noise3d(volumeSize: x32).write3d(vol0, geo0)
noise3d(volumeSize: x128).write3d(vol1, geo1)
render(o0)`
    )
    // Per-pass shader uniform stays as `volumeSize` (each chain has its own value).
    // The chain-scoped variant `volumeSize_chain_N` rides along for texture sizing.
    const pass0 = graph.passes.find(p => p.id?.startsWith('node_0_'))
    const pass2 = graph.passes.find(p => p.id?.startsWith('node_2_'))
    if (pass0.uniforms.volumeSize !== 32) {
        throw new Error(`first chain pass.uniforms.volumeSize: expected 32, got ${pass0.uniforms.volumeSize}`)
    }
    if (pass0.uniforms.volumeSize_chain_0 !== 32) {
        throw new Error(`first chain pass.uniforms.volumeSize_chain_0: expected 32, got ${pass0.uniforms.volumeSize_chain_0}`)
    }
    if (pass2.uniforms.volumeSize !== 128) {
        throw new Error(`second chain pass.uniforms.volumeSize: expected 128, got ${pass2.uniforms.volumeSize}`)
    }
    if (pass2.uniforms.volumeSize_chain_1 !== 128) {
        throw new Error(`second chain pass.uniforms.volumeSize_chain_1: expected 128, got ${pass2.uniforms.volumeSize_chain_1}`)
    }
})

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
