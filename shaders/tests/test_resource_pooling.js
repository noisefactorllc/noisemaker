/**
 * Regression tests for runtime consumption of the resource allocation plan
 * (GAP-006).
 *
 * The register row describes two missing pieces:
 *   - the analyzer's physical allocation plan (graph.allocations, produced by
 *     allocateResources()) was analysis-only: no pipeline/backend consumer
 *     materialized its texture reuse;
 *   - an agent could not query the actual runtime allocation/reuse plan.
 *
 * Closure: Pipeline.getResourcePlan() reports the analyzer plan plus the
 * sharing the renderer actually materialized, and the explicit opt-in
 * `texturePooling: true` makes the pipeline consume the plan — virtual
 * textures with disjoint lifetimes share one backend texture record.
 *
 * All paths go through public entry points: `compileGraph()` and the
 * `Pipeline` class with a recording backend.
 *
 * Run:  node shaders/tests/test_resource_pooling.js
 */

import assert from 'node:assert/strict'
import { compileGraph } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'
import { Effect, registerEffect, registerOp, registerStarterOps } from '../src/index.js'

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
// Recording backend: tracks created/destroyed texture records
// ---------------------------------------------------------------------------

class RecordingBackend extends Backend {
    constructor() {
        super(null)
        this.created = []       // { id, spec }
        this.destroyed = []
    }

    async init() {}

    createTexture(id, spec) {
        this.created.push({ id, spec })
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, format: spec.format,
            mipmaps: spec.mipmaps === true,
            mipLevels: spec.mipmaps === true ? 4 : 1,
            persistent: spec.persistent === true
        })
        return this.textures.get(id)
    }

    createTexture3D(id, spec) {
        this.created.push({ id, spec, is3D: true })
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, depth: spec.depth,
            format: spec.format, is3D: true, filter: spec.filter
        })
        return this.textures.get(id)
    }

    destroyTexture(id) { this.destroyed.push(id); this.textures.delete(id) }

    copyTexture() {}

    generateMipmaps() {}

    async compileProgram(id, spec) { return { handle: id, type: spec.type } }

    executePass(pass) {
        // Record the backend record identity each pass binds through its
        // input/output ids, so aliasing is exercised at execution time.
        const bound = {}
        for (const texId of [
            ...Object.values(pass.inputs || {}),
            ...Object.values(pass.outputs || {})
        ]) {
            bound[texId] = this.textures.get(texId) || null
        }
        this.executed = this.executed || []
        this.executed.push({ id: pass.id, bound })
    }

    beginFrame() {}

    endFrame() {}

    resize() {}

    async readPixels() {
        return { width: 1, height: 1, data: new Uint8Array(4) }
    }

    getName() { return 'Recording' }

    static isAvailable() { return true }
}

// ---------------------------------------------------------------------------
// Probe effects
// ---------------------------------------------------------------------------

function registerProbe(name, extra = {}) {
    const def = {
        name: 'Pool Probe',
        namespace: 'synth',
        func: name,
        description: 'Resource pooling probe used by tests',
        tags: ['noise', 'util'],
        ...extra,
        passes: extra.passes || [
            { program: 'p0', inputs: {}, outputs: { color: 'texA' } },
            { program: 'p1', inputs: { src: 'texA' }, outputs: { color: 'texB' } },
            { program: 'p2', inputs: { src: 'texB' }, outputs: { color: 'texC' } },
            { program: 'p3', inputs: { src: 'texC' }, outputs: { color: 'o0' } }
        ]
    }
    const instance = new Effect(def)
    // Shader sources are normally inlined at bundle time; tests attach them
    // directly (the Effect config constructor does not copy `shaders`).
    instance.shaders = {
        p0: { glsl: 'void main() {}', wgsl: '@fragment fn main() {}' },
        p1: { glsl: 'void main() {}', wgsl: '@fragment fn main() {}' },
        p2: { glsl: 'void main() {}', wgsl: '@fragment fn main() {}' },
        p3: { glsl: 'void main() {}', wgsl: '@fragment fn main() {}' }
    }
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
    return instance
}

registerProbe('poolProbeA')
// Probe whose overlapping pair carries policy fields that block pooling
registerProbe('poolProbeB', {
    textures: {
        texB: { width: 'screen', height: 'screen', format: 'rgba16f', persistent: true }
    }
})
// Probe whose reused physical slot carries mismatched specs
registerProbe('poolProbeC', {
    textures: {
        texA: { width: 64, height: 64, format: 'rgba32f' }
    }
})

function compile(source) {
    return compileGraph(source)
}

// ---------------------------------------------------------------------------
// Part 1: the analyzer plan is present on the compiled graph
// ---------------------------------------------------------------------------

await test('compileGraph exposes the physical allocation plan with reuse', () => {
    const graph = compile('search synth\npoolProbeA().write(o0)\nrender(o0)')
    assert.ok(graph.allocations instanceof Map, 'graph.allocations must be a Map')
    const physA = graph.allocations.get('node_0_texA')
    const physC = graph.allocations.get('node_0_texC')
    assert.ok(physA && physC, 'both chain textures must be allocated')
    assert.equal(physA, physC,
        'texC must reuse texA\'s physical slot (disjoint lifetimes)')
})

// ---------------------------------------------------------------------------
// Part 2: default behavior — one backend texture per virtual id (unchanged)
// ---------------------------------------------------------------------------

await test('default pipeline does not pool: each virtual id keeps its own texture', async () => {
    const graph = compile('search synth\npoolProbeA().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(64, 64)

    const a = backend.textures.get('node_0_texA')
    const c = backend.textures.get('node_0_texC')
    assert.ok(a && c, 'both textures must exist')
    assert.notEqual(a, c, 'without opt-in the reused slot must not share a record')

    const plan = pipeline.getResourcePlan()
    assert.equal(plan.pooling, false, 'plan must report pooling disabled')
    assert.equal(plan.sharedTextures.length, 0,
        'no shared groups without opt-in')
    assert.equal(plan.allocations.get('node_0_texA'), plan.allocations.get('node_0_texC'),
        'the analyzer plan stays queryable')
    for (const entry of plan.textures) {
        assert.equal(entry.virtualTextures.length, 1,
            'each backend texture serves exactly one virtual texture')
    }
})

// ---------------------------------------------------------------------------
// Part 3: opt-in pooling — the renderer consumes the physical plan
// ---------------------------------------------------------------------------

await test('texturePooling opt-in makes disjoint virtual textures share one record', async () => {
    const graph = compile('search synth\npoolProbeA().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    const a = backend.textures.get('node_0_texA')
    const c = backend.textures.get('node_0_texC')
    assert.ok(a && c, 'both textures must be resolvable')
    assert.equal(a, c, 'pooled members must resolve to the same backend record')

    const b = backend.textures.get('node_0_texB')
    assert.notEqual(a, b, 'textures with overlapping lifetimes must stay separate')

    const plan = pipeline.getResourcePlan()
    assert.equal(plan.pooling, true, 'plan must report pooling enabled')
    assert.ok(plan.sharedTextures.some(members =>
        members.includes('node_0_texA') && members.includes('node_0_texC')),
        `sharedTextures must report the A/C reuse: ${JSON.stringify(plan.sharedTextures)}`)
    const pooledCreates = backend.created.filter(c => c.id === 'node_0_texC')
    assert.equal(pooledCreates.length, 0,
        'the pooled member must not get its own backend texture')
})

await test('pooled execution binds every pass through the shared record', async () => {
    const graph = compile('search synth\npoolProbeA().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    pipeline.render(0)
    assert.ok(backend.executed && backend.executed.length > 0,
        'render must execute passes through the backend')
    // At execution time, every texture id a pass references must bind a
    // record, and the pooled pair must resolve to the SAME record through
    // both ids.
    const boundRecords = new Map()
    for (const execution of backend.executed) {
        for (const [texId, record] of Object.entries(execution.bound)) {
            assert.ok(record, `pass ${execution.id} must bind a record for ${texId}`)
            if (!boundRecords.has(texId)) boundRecords.set(texId, record)
        }
    }
    assert.equal(boundRecords.get('node_0_texA'), boundRecords.get('node_0_texC'),
        'execution-time bindings for the pooled pair must be the same record')
    assert.notEqual(boundRecords.get('node_0_texA'), boundRecords.get('node_0_texB'),
        'textures with overlapping lifetimes must bind distinct records')
})

// ---------------------------------------------------------------------------
// Part 4: pooling safety — policy fields and spec mismatches block sharing
// ---------------------------------------------------------------------------

await test('persistent textures are never pooled even with disjoint lifetimes', async () => {
    const graph = compile('search synth\npoolProbeB().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    // texB is persistent; any physical group containing it must not pool
    const physB = graph.allocations.get('node_0_texB')
    const partners = [...graph.allocations].filter(([id, phys]) =>
        phys === physB && id !== 'node_0_texB').map(([id]) => id)
    assert.ok(partners.length > 0,
        `probe must exercise a reused physical slot containing texB: ${JSON.stringify([...graph.allocations])}`)
    if (partners.length > 0) {
        const b = backend.textures.get('node_0_texB')
        for (const partner of partners) {
            assert.notEqual(backend.textures.get(partner), b,
                `persistent node_0_texB must not share a record with ${partner}`)
        }
    }
    assert.ok(backend.textures.get('node_0_texB').persistent === true,
        'persistent flag must reach the backend record')
})

await test('mismatched specs in a physical group fall back to standalone textures', async () => {
    const graph = compile('search synth\npoolProbeC().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    const physA = graph.allocations.get('node_0_texA')
    const partners = [...graph.allocations].filter(([id, phys]) =>
        phys === physA && id !== 'node_0_texA').map(([id]) => id)
    assert.ok(partners.length > 0, 'probe must exercise a reused physical slot')
    const a = backend.textures.get('node_0_texA')
    assert.equal(a.format, 'rgba32f', 'explicit format must reach the backend')
    for (const partner of partners) {
        assert.notEqual(backend.textures.get(partner), a,
            `mismatched spec must not pool ${partner} with node_0_texA`)
    }
})

await test('textures read before they are written are never pooled', async () => {
    // poolProbeE: texC is sampled at pass 1 before its producing pass 2, so
    // its first touch is a read; it must keep the zero-initialized standalone
    // texture even though the analyzer reuses texA's physical slot for it.
    registerProbe('poolProbeE', {
        passes: [
            { program: 'p0', inputs: {}, outputs: { color: 'texA' } },
            { program: 'p1', inputs: { src: 'texA', prev: 'texC' }, outputs: { color: 'texB' } },
            { program: 'p2', inputs: { src: 'texB' }, outputs: { color: 'texC' } },
            { program: 'p3', inputs: { src: 'texC' }, outputs: { color: 'o0' } }
        ]
    })
    const graph = compile('search synth\npoolProbeE().write(o0)\nrender(o0)')
    const physA = graph.allocations.get('node_0_texA')
    const physC = graph.allocations.get('node_0_texC')
    assert.equal(physA, physC,
        'precondition: the analyzer must assign texC the reused physical slot')

    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    assert.notEqual(backend.textures.get('node_0_texA'), backend.textures.get('node_0_texC'),
        'a read-before-write texture must not share storage with an earlier writer')
    const plan = pipeline.getResourcePlan()
    assert.ok(!plan.sharedTextures.some(members =>
        members.includes('node_0_texA') && members.includes('node_0_texC')),
        `the read-before-write pair must not be reported shared: ${JSON.stringify(plan.sharedTextures)}`)
})

await test('textures sampled by their own producing pass are never pooled', async () => {
    // poolProbeF: texA is both written and sampled by pass 0, so its storage
    // must keep the previous-frame contents a standalone texture holds.
    registerProbe('poolProbeF', {
        passes: [
            { program: 'p0', inputs: { prev: 'texA' }, outputs: { color: 'texA' } },
            { program: 'p1', inputs: { src: 'texA' }, outputs: { color: 'texB' } },
            { program: 'p2', inputs: { src: 'texB' }, outputs: { color: 'o0' } }
        ]
    })
    const graph = compile('search synth\npoolProbeF().write(o0)\nrender(o0)')
    const physA = graph.allocations.get('node_0_texA')
    assert.equal(physA, graph.allocations.get('node_0_o0'),
        'precondition: the analyzer must assign o0 the reused physical slot')

    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    assert.notEqual(backend.textures.get('node_0_texA'), backend.textures.get('node_0_o0'),
        'self-sampled texA must not share storage with a group-mate')
    for (const members of pipeline.getResourcePlan().sharedTextures) {
        assert.ok(!members.includes('node_0_texA'),
            `self-sampled texA must not appear in a shared group: ${JSON.stringify(members)}`)
    }
})

await test('accumulation textures written by scatter passes are never pooled', async () => {
    // Agent-deposit pattern: the accumulation texture is written by a
    // drawMode:'points' pass that scatters without covering the surface, so
    // its storage must keep its own cross-frame contents. The analyzer sees
    // only disjoint lifetimes and reuses texA's slot for it; pooling must
    // refuse.
    registerProbe('poolProbeG', {
        passes: [
            { program: 'p0', inputs: {}, outputs: { color: 'texA' } },
            { program: 'p1', inputs: { src: 'texA' }, outputs: { color: 'texB' } },
            { program: 'p2', inputs: {}, outputs: { color: 'acc' }, drawMode: 'points', count: 64 },
            { program: 'p3', inputs: { src: 'acc' }, outputs: { color: 'o0' } }
        ]
    })
    const graph = compile('search synth\npoolProbeG().write(o0)\nrender(o0)')
    const physA = graph.allocations.get('node_0_texA')
    assert.equal(physA, graph.allocations.get('node_0_acc'),
        'precondition: the analyzer must assign acc the reused physical slot')

    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    assert.notEqual(backend.textures.get('node_0_texA'), backend.textures.get('node_0_acc'),
        'a scatter-written accumulation texture must not share storage')
    const plan = pipeline.getResourcePlan()
    assert.ok(!plan.sharedTextures.some(members =>
        members.includes('node_0_acc')),
        `the scatter-written texture must not be reported shared: ${JSON.stringify(plan.sharedTextures)}`)
})

await test('blend-written textures are never pooled', async () => {
    // A blending pass reads the destination, so its output depends on the
    // texture's previous contents; pooled storage could hand it a group-mate's
    // frame content.
    registerProbe('poolProbeH', {
        passes: [
            { program: 'p0', inputs: {}, outputs: { color: 'texA' } },
            { program: 'p1', inputs: { src: 'texA' }, outputs: { color: 'texB' } },
            { program: 'p2', inputs: {}, outputs: { color: 'blended' }, blend: true },
            { program: 'p3', inputs: { src: 'blended' }, outputs: { color: 'o0' } }
        ]
    })
    const graph = compile('search synth\npoolProbeH().write(o0)\nrender(o0)')
    const physA = graph.allocations.get('node_0_texA')
    assert.equal(physA, graph.allocations.get('node_0_blended'),
        'precondition: the analyzer must assign blended the reused physical slot')

    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)

    assert.notEqual(backend.textures.get('node_0_texA'), backend.textures.get('node_0_blended'),
        'a blend-written texture must not share storage with an earlier writer')
})

// ---------------------------------------------------------------------------
// Part 5: plan survives resize and regroups after recompile
// ---------------------------------------------------------------------------

await test('pooled aliases survive resize with identical records', async () => {
    const graph = compile('search synth\npoolProbeA().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)
    const before = backend.textures.get('node_0_texA')

    pipeline.resize(32, 32)

    const a = backend.textures.get('node_0_texA')
    const c = backend.textures.get('node_0_texC')
    assert.ok(a && c, 'both textures must exist after resize')
    assert.equal(a, c, 'pooling must persist across resize')
    assert.equal(a.width, 32, 'shared record must be resized')
    assert.notEqual(a, before, 'resize must have recreated the storage texture')
})

await test('recompile to a non-reusing graph releases the pooled sharing', async () => {
    const { recompile } = await import('../src/runtime/compiler.js')
    registerProbe('poolProbeD', {
        passes: [
            { program: 'p0', inputs: {}, outputs: { color: 'texA' } },
            { program: 'p3', inputs: { src: 'texA' }, outputs: { color: 'o0' } }
        ]
    })
    const graph = compile('search synth\npoolProbeA().write(o0)\nrender(o0)')
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend, { texturePooling: true })
    await pipeline.init(64, 64)
    assert.equal(backend.textures.get('node_0_texA'),
        backend.textures.get('node_0_texC'), 'precondition: pooled before recompile')

    const newGraph = recompile(pipeline, 'search synth\npoolProbeD().write(o0)\nrender(o0)')
    assert.ok(newGraph, 'recompile must succeed')
    const plan = pipeline.getResourcePlan()
    assert.equal(plan.pooling, true, 'pooling stays enabled after recompile')
    for (const members of plan.sharedTextures) {
        const records = members.map(id => backend.textures.get(id))
        assert.ok(records.every(r => r === records[0]),
            'reported shared groups must still share records')
    }
    const physA = newGraph.allocations.get('node_0_texA')
    const sharers = [...newGraph.allocations].filter(([, phys]) => phys === physA).length
    assert.equal(sharers, 1, 'the new graph has no reuse, so no shared group')
    assert.equal(plan.sharedTextures.length, 0,
        'a graph without reuse must report no shared textures')
})

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
