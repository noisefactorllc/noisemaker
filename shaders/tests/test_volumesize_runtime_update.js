/**
 * Regression test for runtime updates to volumeSize in 3D chains.
 *
 * Static expansion (test_volumesize_per_chain.js) verifies that initial
 * texture sizing and uniforms are correct after the expander runs.
 *
 * This test guards the dynamic UI path: when the user changes the emitter's
 * volumeSize at runtime, the new value must propagate to:
 *   - All chain-scoped texture atlases (so noise3d / flow3d / global_flow3d_*
 *     all resize together).
 *   - All downstream effects' shader uniforms (so flow3d and render3d's
 *     shaders agree with the emitter on volume size).
 *
 * Bug reported (2026-05): the chain-scoped variable `volumeSize_chain_N` is
 * shared across the chain and is the source of truth for atlas sizing. The
 * runtime UI paths (canvas.applyStepParameterValues and
 * program-state._applyToPipeline) iterate per-step and write the step's local
 * volumeSize value to its pass(es), then propagate to the chain-scoped slot
 * via pass.scopedParams. Downstream effects (flow3d, render3d) hold their
 * OWN default volumeSize in their step state, so their writes clobber the
 * emitter's value in `volumeSize_chain_N`. Symptom: changing the emitter's
 * volumeSize is silently overridden by the downstream's stale default.
 *
 * Run:  node shaders/tests/test_volumesize_runtime_update.js
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

async function test(name, fn) {
    try {
        await fn()
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

function findPassByStepIndex(graph, stepIndex) {
    return graph.passes.find(p => p.stepIndex === stepIndex)
}

// ---------------------------------------------------------------------------

await test('noise3d → flow3d: applyStepParameterValues bumping emitter volumeSize resizes whole chain', () => {
    // Each effect has its OWN volumeSize default (noise3d:64, flow3d:32). The
    // DSL pins noise3d to x32 (matches flow3d's default). Initial state: all
    // chain_0 atlases at 32×1024. User then bumps noise3d's volumeSize to 128
    // via the UI; downstream effects don't see the change in their step state
    // (UI only edits the emitter slider) but the chain-scoped atlases and the
    // downstream shader uniforms must follow.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().write3d(vol0, geo0)
render(o0)`
    )
    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'initial noise3d atlas')
    assertSize(pipeline, 'node_1_volumeCache', '32x1024', 'initial flow3d atlas')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read', '32x1024', 'initial flow3d trail')

    const noisePass = findPassByStepIndex(graph, 0)
    const flowPass  = graph.passes.find(p => p.effectFunc === 'flow3d')
    if (!noisePass) throw new Error('noise3d pass not found')
    if (!flowPass)  throw new Error('flow3d pass not found')

    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline

    // Simulate the UI: noise3d gets bumped, flow3d's step state still holds
    // its own default (32 — the same as the initial state).
    renderer.applyStepParameterValues({
        [`step_${noisePass.stepIndex}`]: { volumeSize: 128 },
        [`step_${flowPass.stepIndex}`]:  { volumeSize: 32 }
    })

    // The whole chain must now be sized for volumeSize=128.
    assertSize(pipeline, 'node_0_volumeCache', '128x16384', 'noise3d atlas after bump')
    assertSize(pipeline, 'node_1_volumeCache', '128x16384', 'flow3d atlas after bump')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read',   '128x16384', 'flow3d trail after bump')
    assertSize(pipeline, 'global_flow3d_blended_chain_0_read', '128x16384', 'flow3d blended after bump')

    // And every pass that consumes volumeSize must see 128 — flow3d's shader
    // can't sample correctly from a 128-sized volume if it thinks size is 32.
    for (const pass of graph.passes) {
        if (pass.uniforms && 'volumeSize' in pass.uniforms) {
            if (pass.uniforms.volumeSize !== 128) {
                throw new Error(`pass ${pass.id}: volumeSize expected 128, got ${pass.uniforms.volumeSize}`)
            }
        }
    }
})

await test('full noise3d → flow3d → render3d: bumping emitter volumeSize propagates to renderer', () => {
    // Render3d ALSO declares volumeSize in its globals (default=64) with
    // ui.control:false ("always inherited from upstream"). If the runtime
    // path writes render3d's local default into its pass uniforms, the
    // raymarcher will sample at the wrong rate.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().render3d().write(o0)
render(o0)`
    )

    const noisePass  = findPassByStepIndex(graph, 0)
    const flowPass   = graph.passes.find(p => p.effectFunc === 'flow3d')
    const renderPass = graph.passes.find(p => p.effectFunc === 'render3d')

    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline

    renderer.applyStepParameterValues({
        [`step_${noisePass.stepIndex}`]:  { volumeSize: 128 },
        [`step_${flowPass.stepIndex}`]:   { volumeSize: 32 },  // stale default
        [`step_${renderPass.stepIndex}`]: { volumeSize: 64 }   // stale default
    })

    // Atlases sized for 128.
    assertSize(pipeline, 'node_0_volumeCache', '128x16384', 'noise3d atlas')
    assertSize(pipeline, 'node_1_volumeCache', '128x16384', 'flow3d atlas')

    // All shader uniforms read 128.
    for (const pass of graph.passes) {
        if (pass.uniforms && 'volumeSize' in pass.uniforms) {
            if (pass.uniforms.volumeSize !== 128) {
                throw new Error(`pass ${pass.id} (${pass.effectFunc}): volumeSize expected 128, got ${pass.uniforms.volumeSize}`)
            }
        }
    }
})

await test('decreasing emitter volumeSize shrinks the whole chain (no leftover large atlas)', () => {
    // Mirror of the increase case. User starts at noise3d(volumeSize: x128)
    // then drags slider down to 32 — atlases must shrink, downstream uniforms
    // must follow.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x128).flow3d().render3d().write(o0)
render(o0)`
    )
    assertSize(pipeline, 'node_0_volumeCache', '128x16384', 'initial noise3d atlas')

    const noisePass  = findPassByStepIndex(graph, 0)
    const flowPass   = graph.passes.find(p => p.effectFunc === 'flow3d')
    const renderPass = graph.passes.find(p => p.effectFunc === 'render3d')

    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline

    renderer.applyStepParameterValues({
        [`step_${noisePass.stepIndex}`]:  { volumeSize: 32 },
        [`step_${flowPass.stepIndex}`]:   { volumeSize: 32 },
        [`step_${renderPass.stepIndex}`]: { volumeSize: 64 }
    })

    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'noise3d atlas shrunk')
    assertSize(pipeline, 'node_1_volumeCache', '32x1024', 'flow3d atlas shrunk')

    for (const pass of graph.passes) {
        if (pass.uniforms && 'volumeSize' in pass.uniforms) {
            if (pass.uniforms.volumeSize !== 32) {
                throw new Error(`pass ${pass.id} (${pass.effectFunc}): volumeSize expected 32, got ${pass.uniforms.volumeSize}`)
            }
        }
    }
})

await test('multi-chain isolation: bumping one chain doesnt affect the other', () => {
    // Side-by-side guard: two 3D chains with their own volumeSize. Bumping
    // emitter on chain_0 must not perturb chain_1's atlases or uniforms.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().write3d(vol0, geo0)
noise3d(volumeSize: x64).flow3d().write3d(vol1, geo1)
render(o0)`
    )
    // chain_0 starts at 32×1024, chain_1 starts at 64×4096.
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read', '32x1024', 'chain_0 trail before')
    assertSize(pipeline, 'global_flow3d_trail_chain_1_read', '64x4096', 'chain_1 trail before')

    // Bump chain_0's emitter to 128 (chain_1 untouched).
    const chain0Noise = graph.passes.find(p =>
        p.scopedParams && p.scopedParams.volumeSize === 'volumeSize_chain_0' && p.effectFunc === 'noise3d')
    const chain1Noise = graph.passes.find(p =>
        p.scopedParams && p.scopedParams.volumeSize === 'volumeSize_chain_1' && p.effectFunc === 'noise3d')
    if (!chain0Noise || !chain1Noise) throw new Error('chain noise3d passes not found')

    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline

    renderer.applyStepParameterValues({
        [`step_${chain0Noise.stepIndex}`]: { volumeSize: 128 },
        [`step_${chain1Noise.stepIndex}`]: { volumeSize: 64 }
    })

    assertSize(pipeline, 'global_flow3d_trail_chain_0_read', '128x16384', 'chain_0 trail after')
    assertSize(pipeline, 'global_flow3d_trail_chain_1_read', '64x4096',   'chain_1 trail unchanged')
})

// ProgramState path: the demo-ui slider goes through ProgramState.setValue ->
// _applyToPipeline, which writes pass.uniforms directly (not via the canvas
// applyStep* methods). The same inherit-and-broadcast logic must apply.
const programStateMod = await import(new URL('../../demo/shaders/lib/program-state.js', import.meta.url).pathname)
const { ProgramState } = programStateMod

function makeFakeRenderer(pipeline) {
    return {
        pipeline,
        currentDsl: '',
        // ProgramState only invokes convertParameterForUniform; a passthrough is
        // enough for numeric volumeSize values.
        convertParameterForUniform(value /* , spec */) {
            return value
        }
    }
}

await test('ProgramState.setValue on emitter propagates volumeSize through chain', () => {
    const dsl = `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().render3d().write(o0)
render(o0)`

    const { graph, pipeline } = buildPipeline(dsl)
    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'initial noise3d atlas')

    const state = new ProgramState({ renderer: makeFakeRenderer(pipeline) })
    state.fromDsl(dsl)

    // After fromDsl, every step gets its OWN volumeSize default in step state
    // (noise3d:64 default but pinned to 32 in DSL, flow3d:32, render3d:64).
    // _applyToPipeline would clobber the chain-scoped variant with downstream
    // stale defaults if we didn't gate consumer writes.
    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'after fromDsl noise3d atlas')
    assertSize(pipeline, 'node_1_volumeCache', '32x1024', 'after fromDsl flow3d atlas')

    // User drags the noise3d slider to 128.
    state.setValue('step_0', 'volumeSize', 128)

    assertSize(pipeline, 'node_0_volumeCache', '128x16384', 'noise3d atlas after slider bump')
    assertSize(pipeline, 'node_1_volumeCache', '128x16384', 'flow3d atlas after slider bump')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read',   '128x16384', 'flow3d trail')
    assertSize(pipeline, 'global_flow3d_blended_chain_0_read', '128x16384', 'flow3d blended')

    for (const pass of graph.passes) {
        if (pass.uniforms && 'volumeSize' in pass.uniforms) {
            if (pass.uniforms.volumeSize !== 128) {
                throw new Error(`pass ${pass.id} (${pass.effectFunc}): volumeSize expected 128, got ${pass.uniforms.volumeSize}`)
            }
        }
    }
})

await test('applyParameterValues (single-effect mode) propagates emitter volumeSize through chain', async () => {
    // Single-effect mode is the host-driven path used by docs viewer, MCP
    // harness, foundry, etc. They preview one effect at a time and call
    // `applyParameterValues(effect, params)` with only that effect's
    // definition. The gate must hold there too — otherwise a bind to the
    // emitter's volumeSize won't update downstream chain members.
    const { graph, pipeline } = buildPipeline(
        `search synth3d, filter3d, render
noise3d(volumeSize: x32).flow3d().render3d().write(o0)
render(o0)`
    )
    assertSize(pipeline, 'node_0_volumeCache', '32x1024', 'initial')

    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline
    renderer._uniformBindings = new Map()

    // Mirror loadEffectFromBundle / loadEffectDefinition shape: hand the
    // emitter's effect descriptor; buildUniformBindings walks its passes.
    const noiseMod = await import(new URL('../effects/synth3d/noise3d/definition.js', import.meta.url).pathname)
    const noiseInstance = (typeof noiseMod.default === 'function') ? new noiseMod.default() : noiseMod.default
    const effect = { instance: noiseInstance, namespace: 'synth3d' }

    renderer.applyParameterValues(effect, { volumeSize: 128 })

    // The whole chain resized.
    assertSize(pipeline, 'node_0_volumeCache', '128x16384', 'noise3d atlas after bump')
    assertSize(pipeline, 'node_1_volumeCache', '128x16384', 'flow3d atlas after bump')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read', '128x16384', 'flow3d trail after bump')

    // Every consuming pass sees the new size.
    for (const pass of graph.passes) {
        if (pass.uniforms && 'volumeSize' in pass.uniforms) {
            if (pass.uniforms.volumeSize !== 128) {
                throw new Error(`pass ${pass.id} (${pass.effectFunc}): volumeSize expected 128, got ${pass.uniforms.volumeSize}`)
            }
        }
    }
})

await test('ProgramState path: downstream effect sliders are no-ops for volumeSize', () => {
    // Dragging render3d's slider (if user somehow exposed it) shouldn't be
    // able to fight the source emitter — render3d declares ui.control:false
    // for volumeSize because it always inherits. The runtime gate enforces
    // the same invariant defensively.
    const dsl = `search synth3d, filter3d, render
noise3d(volumeSize: x64).flow3d().render3d().write(o0)
render(o0)`

    const { graph, pipeline } = buildPipeline(dsl)
    const state = new ProgramState({ renderer: makeFakeRenderer(pipeline) })
    state.fromDsl(dsl)

    assertSize(pipeline, 'node_0_volumeCache', '64x4096', 'initial')

    // Find render3d's stepKey via the pass graph.
    const renderPass = graph.passes.find(p => p.effectFunc === 'render3d')
    const renderStepKey = `step_${renderPass.stepIndex}`

    // Try to override render3d's volumeSize from "below". The gate must
    // prevent this; the chain-scoped variant must remain at the source value.
    state.setValue(renderStepKey, 'volumeSize', 16)

    // Atlases stay at noise3d's 64.
    assertSize(pipeline, 'node_0_volumeCache', '64x4096', 'noise3d atlas unaffected')
    assertSize(pipeline, 'global_flow3d_trail_chain_0_read', '64x4096', 'flow3d trail unaffected')

    // Source pass and consumer passes alike show 64 (consumer's local value
    // does live in step state, but the inherits gate keeps it out of the
    // pass uniforms).
    for (const pass of graph.passes) {
        if (pass.uniforms && 'volumeSize' in pass.uniforms) {
            if (pass.uniforms.volumeSize !== 64) {
                throw new Error(`pass ${pass.id} (${pass.effectFunc}): volumeSize expected 64, got ${pass.uniforms.volumeSize}`)
            }
        }
    }
})

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
