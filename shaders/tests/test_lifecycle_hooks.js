/**
 * Regression tests for the production lifecycle hooks (GAP-026).
 *
 * The register row describes onInit/onUpdate/onDestroy being copied into the
 * Effect wrappers but never invoked by the production renderer — only the
 * test harness (shaders/tests/harness_effect.js) called them, so an authored
 * config callback could look valid but never run in production.
 *
 * After the fix the Pipeline invokes all three hooks:
 *   - onInit() once per effect instance per pipeline lifetime, from
 *     initLifecycleEffects() at the same sites as initAsyncEffects()
 *     (resize and hot recompile);
 *   - onUpdate({ time, delta, uniforms }) once per frame per effect, with
 *     returned uniforms bound under fallback semantics: a returned uniform
 *     binds only when the pass does not already resolve that key, so
 *     authored/step-provided values — including shipped synth/media's
 *     onUpdate-returned imageSize defaults — keep priority;
 *   - onDestroy() for every managed effect at Pipeline.dispose().
 *
 * All paths go through public entry points: compileGraph() and the Pipeline
 * class with a recording backend that captures every pass handed to
 * executePass().
 *
 * Run:  node shaders/tests/test_lifecycle_hooks.js
 */

import assert from 'node:assert/strict'
import { compileGraph, recompile } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'
import { Effect } from '../src/runtime/effect.js'
import {
    registerEffect, registerOp, registerStarterOps
} from '../src/index.js'

let passed = 0
let failed = 0

async function test(name, fn) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e && e.message ? e.message : e)
        failed++
    }
}

// ---------------------------------------------------------------------------
// Probe effects
// ---------------------------------------------------------------------------

function probeSource() {
    return {
        name: 'Lifecycle Probe',
        namespace: 'synth',
        func: 'lifecycleProbe',
        description: 'Lifecycle-hook probe used by tests',
        tags: ['noise', 'util'],
        globals: {
            level: {
                type: 'float', default: 0.5, min: 0, max: 1, uniform: 'level',
                ui: { label: 'level', control: 'slider' }
            }
        },
        textures: {
            acc: { width: 32, height: 32, format: 'rgba16f' }
        },
        shaders: {
            probe: {
                fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }`,
                wgsl: `@fragment
fn main() -> @location(0) vec4<f32> {
    return vec4f(0.0);
}`,
                fragmentEntryPoint: 'main'
            }
        },
        passes: [
            {
                name: 'probePass',
                program: 'probe',
                inputs: {},
                outputs: { color: 'acc' }
            }
        ]
    }
}

function registerProbe(instance) {
    registerEffect(instance.func, instance)
    registerEffect(`synth.${instance.func}`, instance)
    registerOp(`synth.${instance.func}`, {
        name: instance.func,
        args: Object.entries(instance.globals || {}).map(([key, spec]) => ({
            name: key,
            type: spec.type,
            default: spec.default
        }))
    })
    const isStarter = !((instance.passes || []).some(p =>
        p.inputs && Object.values(p.inputs).some(v =>
            ['inputTex', 'inputTex3d', 'src', 'o0', 'o1'].includes(v))))
    if (isStarter) registerStarterOps([`synth.${instance.func}`])
}

// Config-authored hooks: exactly the shape the register row describes —
// callbacks in the effect definition config, copied into the Effect wrapper.
const configCalls = { init: 0, update: [], destroy: 0 }
const configProbeDef = probeSource()
configProbeDef.func = 'lifecycleProbeConfig'
configProbeDef.onInit = () => { configCalls.init++ }
configProbeDef.onUpdate = (context) => { configCalls.update.push({ ...context }) }
configProbeDef.onDestroy = () => { configCalls.destroy++ }
const configProbe = new Effect(configProbeDef)
configProbe.shaders = configProbeDef.shaders
registerProbe(configProbe)

// Subclass-authored hooks: the other shape the wrappers document.
const subclassCalls = { init: 0, update: 0, destroy: 0 }
class SubclassProbe extends Effect {
    constructor() {
        super(probeSource())
        this.func = 'lifecycleProbeSubclass'
        this.name = 'Lifecycle Probe Subclass'
        this.shaders = probeSource().shaders
    }

    onInit() { subclassCalls.init++ }

    onUpdate(context) {
        subclassCalls.update++
        return { runtimeTint: 0.75, lastTime: context.time }
    }

    onDestroy() { subclassCalls.destroy++ }
}
registerProbe(new SubclassProbe())

// Hook-less effect: default parity must be untouched.
const plainDef = probeSource()
plainDef.func = 'lifecycleProbePlain'
plainDef.name = 'Plain Lifecycle Probe'
const plainProbe = new Effect(plainDef)
plainProbe.shaders = plainDef.shaders
registerProbe(plainProbe)

// ---------------------------------------------------------------------------

class RecordingBackend extends Backend {
    constructor() {
        super(null)
        this.executed = []
    }

    async init() {}

    createTexture(id, spec) {
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, format: spec.format
        })
        return this.textures.get(id)
    }

    createTexture3D(id, spec) {
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, depth: spec.depth,
            format: spec.format, is3D: true
        })
        return this.textures.get(id)
    }

    destroyTexture() {}

    async compileProgram(id, spec) { return { handle: id, type: spec.type } }

    executePass(pass) { this.executed.push(pass) }

    beginFrame() {}

    endFrame() {}

    resize() {}

    async readPixels() {
        return { width: 1, height: 1, data: new Uint8Array(4) }
    }

    getName() { return 'Recording' }

    static isAvailable() { return true }
}

function pipelineFor(funcName) {
    const graph = compileGraph(`search synth\n${funcName}().write(o0)\nrender(o0)`)
    graph.renderSurface = null // recording backend has no present path
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend)
    return { pipeline, backend, graph }
}

// ---------------------------------------------------------------------------
// Part 1: config-authored hooks are invoked by the production pipeline
// ---------------------------------------------------------------------------

await test('config-authored onInit/onUpdate/onDestroy run in the production pipeline', async () => {
    const { pipeline } = pipelineFor('lifecycleProbeConfig')
    await pipeline.init(64, 64)
    assert.equal(configCalls.init, 1, 'onInit must run once on pipeline init')

    pipeline.render(0)
    pipeline.render(0.5)
    assert.equal(configCalls.update.length, 2, 'onUpdate must run once per frame')
    assert.equal(configCalls.update[1].time, 0.5, 'onUpdate receives the frame time')
    assert.equal(typeof configCalls.update[1].delta, 'number', 'onUpdate receives a numeric delta')
    assert.equal(configCalls.update[1].uniforms, pipeline.globalUniforms,
        'onUpdate context carries the pipeline global uniforms')

    pipeline.dispose()
    assert.equal(configCalls.destroy, 1, 'onDestroy must run once on dispose')
})

// ---------------------------------------------------------------------------
// Part 2: onUpdate-returned uniforms are bound over the pass uniforms
// ---------------------------------------------------------------------------

await test('onUpdate-returned uniforms reach backend execution', async () => {
    // A hook that returns uniforms for binding.
    const boundDef = probeSource()
    boundDef.func = 'lifecycleProbeBinding'
    boundDef.onUpdate = () => ({ runtimeTint: 0.25 })
    const boundProbe = new Effect(boundDef)
    boundProbe.shaders = boundDef.shaders
    registerProbe(boundProbe)

    const { pipeline, backend, graph } = pipelineFor('lifecycleProbeBinding')
    await pipeline.init(64, 64)

    backend.executed.length = 0
    pipeline.render(0)
    const probePass = backend.executed.find(p => p.effectFunc === 'lifecycleProbeBinding')
    assert.ok(probePass, 'the probe pass must execute')
    assert.equal(probePass.uniforms.runtimeTint, 0.25,
        'the onUpdate-returned uniform must be bound over the pass uniforms')
    const authored = graph.passes.find(p => p.effectFunc === 'lifecycleProbeBinding')
    assert.equal(authored.uniforms.runtimeTint, undefined,
        'the shared authored uniforms object must not be mutated')
})

await test('authored pass uniforms keep priority over onUpdate-returned uniforms', async () => {
    // The shipped synth/media shape: its onUpdate returns imageSize defaults
    // that must never clobber a pass-resolved value (here the authored
    // default of the `level` global).
    const priorityDef = probeSource()
    priorityDef.func = 'lifecycleProbePriority'
    priorityDef.onUpdate = () => ({ level: 0.9 })
    const priorityProbe = new Effect(priorityDef)
    priorityProbe.shaders = priorityDef.shaders
    registerProbe(priorityProbe)

    const { pipeline, backend } = pipelineFor('lifecycleProbePriority')
    await pipeline.init(64, 64)

    backend.executed.length = 0
    pipeline.render(0)
    const probePass = backend.executed.find(p => p.effectFunc === 'lifecycleProbePriority')
    assert.ok(probePass, 'the probe pass must execute')
    assert.equal(probePass.uniforms.level, 0.5,
        'the pass-resolved uniform must keep priority over the hook default')
    pipeline.dispose()
})

await test('plain-object definitions without hooks survive pipeline init (no false hook detection)', async () => {
    // registerEffect() accepts plain objects; a definition without hook keys
    // must not be misread as overriding the base-class methods. (asyncInit is
    // stubbed because initAsyncEffects' pre-existing singleton check treats a
    // plain object without it as an async effect — outside this gap.)
    const objNoHooks = probeSource()
    objNoHooks.func = 'lifecycleProbeObjectPlain'
    objNoHooks.name = 'Object Lifecycle Probe'
    objNoHooks.asyncInit = () => Promise.resolve()
    registerProbe(objNoHooks)

    const { pipeline, backend, graph } = pipelineFor('lifecycleProbeObjectPlain')
    await pipeline.init(64, 64)
    backend.executed.length = 0
    pipeline.render(0)
    const authored = graph.passes.find(p => p.effectFunc === 'lifecycleProbeObjectPlain')
    assert.equal(backend.executed[0], authored,
        'a hook-less plain-object definition keeps pass identity')
    pipeline.dispose()
})

await test('plain-object definitions with hooks are invoked', async () => {
    const objCalls = { update: 0 }
    const objHooked = probeSource()
    objHooked.func = 'lifecycleProbeObjectHooked'
    objHooked.name = 'Object Hooked Probe'
    objHooked.asyncInit = () => Promise.resolve()
    objHooked.onUpdate = () => { objCalls.update++; return {} }
    registerProbe(objHooked)

    const { pipeline } = pipelineFor('lifecycleProbeObjectHooked')
    await pipeline.init(64, 64)
    pipeline.render(0)
    assert.equal(objCalls.update, 1,
        'a plain-object onUpdate hook must run once per frame')
    pipeline.dispose()
})

// ---------------------------------------------------------------------------
// Part 3: onInit is once-per-pipeline across resize and hot recompile
// ---------------------------------------------------------------------------

await test('onInit runs once per pipeline across resize', async () => {
    configCalls.init = 0
    configCalls.destroy = 0
    const { pipeline } = pipelineFor('lifecycleProbeConfig')
    await pipeline.init(64, 64)
    assert.equal(configCalls.init, 1)
    pipeline.resize(64, 64)
    assert.equal(configCalls.init, 1,
        'a resize must not re-run onInit for the same pipeline')
    pipeline.dispose()
    assert.equal(configCalls.destroy, 1,
        'dispose must not re-run onDestroy for the same pipeline')
})

await test('a hot recompile through compiler.recompile() rebuilds the managed set without re-running onInit', async () => {
    configCalls.init = 0
    configCalls.destroy = 0
    const { pipeline } = pipelineFor('lifecycleProbeConfig')
    await pipeline.init(64, 64)
    assert.equal(configCalls.init, 1)
    const graph = recompile(pipeline, 'search synth\nlifecycleProbeConfig().write(o0)\nrender(o0)')
    assert.ok(graph, 'recompile must succeed')
    assert.equal(pipeline.graph, graph, 'recompile must swap the graph on the pipeline')
    assert.equal(configCalls.init, 1,
        'a hot recompile must not re-run onInit for the same pipeline')
    pipeline.dispose()
})

await test('recompile() skips lifecycle init on stub pipelines without initLifecycleEffects', async () => {
    const stub = {
        graph: null,
        width: 64,
        height: 64,
        createSurfaces() {},
        collectDefaultUniforms() { return {} },
        recreateTextures() {},
        initAsyncEffects() {}
    }
    const graph = recompile(stub, 'search synth\nlifecycleProbePlain().write(o0)\nrender(o0)')
    assert.ok(graph, 'a stub pipeline without initLifecycleEffects must still recompile')
})

// ---------------------------------------------------------------------------
// Part 4: subclass hooks are invoked too
// ---------------------------------------------------------------------------

await test('subclass lifecycle hooks run in the production pipeline', async () => {
    const { pipeline, backend } = pipelineFor('lifecycleProbeSubclass')
    await pipeline.init(64, 64)
    assert.ok(subclassCalls.init >= 1,
        'the subclass onInit must run on pipeline init')

    backend.executed.length = 0
    pipeline.render(0.25)
    const probePass = backend.executed.find(p => p.effectFunc === 'lifecycleProbeSubclass')
    assert.ok(probePass, 'the probe pass must execute')
    assert.equal(probePass.uniforms.runtimeTint, 0.75,
        'subclass onUpdate-returned uniforms must be bound')
    assert.equal(probePass.uniforms.lastTime, 0.25,
        'subclass onUpdate receives the frame time')

    pipeline.dispose()
    assert.equal(subclassCalls.destroy, subclassCalls.init,
        'every subclass onInit must be matched by one onDestroy at dispose')
})

// ---------------------------------------------------------------------------
// Part 5: hook-less effects keep default parity
// ---------------------------------------------------------------------------

await test('hook-less effects keep byte-identical pass execution', async () => {
    const { pipeline, backend, graph } = pipelineFor('lifecycleProbePlain')
    await pipeline.init(64, 64)

    backend.executed.length = 0
    pipeline.render(0)
    assert.equal(backend.executed.length, 1)
    const executed = backend.executed[0]
    const authored = graph.passes.find(p => p.effectFunc === 'lifecycleProbePlain')
    assert.equal(executed, authored,
        'without lifecycle hooks the original pass object must reach the backend')
    pipeline.dispose()
})

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
