#!/usr/bin/env node
// Capability providers: their registration, the composition of their
// lifecycles onto an effect, and the one lifecycle contract the production
// pipeline runs them under.
//
// The engine's providers replace inline lifecycle code, so their first test
// is equivalence: each of filter/fibers, filter/scratches, filter/strayHair
// and synth/media, as it is now, against its inline implementation at the
// catalog baseline's source commit, exported with git archive. The worm
// overlays must make the same 2D canvas calls in the same order, with the
// same uploads, for each seed, density, size and cancellation point; media
// must keep the same state and return the same uniforms. Their pixel pins on
// the GPU are the second test (audit-portable-migration.mjs --pins --providers).
//
// Then a third-party provider, registered in a fixture host through the
// public API, drives a package through the production Pipeline with a
// recording backend: several nodes and pipelines, resize, recompile, dispose,
// cancellation, by-value dependencies and upload orientation.
//
// Run: node --test shaders/tests/test_portable_capabilities.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

import {
    CanvasRenderer, createCapabilityRegistry, getAllEffects, getEffect, getPortableCapability, instantiatePortableEffect,
    mergeIntoEnums, registerPortableCapability, resolvePortableCapabilities,
} from '../src/index.js'
import { Backend } from '../src/runtime/backend.js'
import { compileGraph, recompile } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { CATALOG_CONTEXT } from '../src/portable/instantiate.js'
import { capabilityUseOf } from '../src/portable/capabilities.js'
import { isStarterOp, registerStarterOps } from '../src/lang/validator.js'
import { exportReferenceSource, providerCases, PROVIDERS_RELATIVE } from '../../scripts/audit-portable-migration.mjs'
import { pinCaseErrors } from '../scripts/pin-baselines.mjs'
import { loadPortablePackage, packageFiles } from '../src/portable/package.js'
import { toPortablePackage, PACKAGE_KEYS } from '../src/portable/definition.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const baseline = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'shaders/tests/fixtures/portable/catalog-baseline.json'), 'utf8'))
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }\n'

let referenceRoot

before(() => {
    // The inline implementations the providers replace: the catalog baseline's source.
    referenceRoot = path.join(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'portable-capabilities-')), 'reference')
    exportReferenceSource(REPO_ROOT, baseline.sourceSha, referenceRoot)
})

after(() => {
    if (referenceRoot) fs.rmSync(path.dirname(referenceRoot), { recursive: true, force: true })
})

const importFrom = (root, relative) => import(pathToFileURL(path.join(root, relative)).href)

// ---------------------------------------------------------------------------
// The worm overlays: every 2D canvas call, in order, against the inline originals.

// A canvas whose 2D context records every call and every property it is set.
function recordingCanvas(log, id) {
    const canvas = { width: 0, height: 0 }
    const ctx = new Proxy({}, {
        get(_, key) {
            if (key === 'canvas') return canvas
            return (...args) => log.push([id, key, ...args])
        },
        set(_, key, value) {
            log.push([id, `${String(key)}=`, value])
            return true
        },
    })
    canvas.getContext = (type, options) => {
        log.push([id, 'getContext', type, options, canvas.width, canvas.height])
        return ctx
    }
    return canvas
}

async function traceLog(effect, { params, width, height, cancelAfter = Infinity }) {
    const log = []
    let canvases = 0
    const canvasIds = new Map()
    globalThis.document = {
        createElement(tag) {
            const canvas = recordingCanvas(log, canvases++)
            canvasIds.set(canvas, canvases - 1)
            log.push(['createElement', tag])
            return canvas
        },
    }
    let checks = 0
    try {
        await effect.asyncInit({
            // The orientation each upload takes, as the pipeline reads it: flipY unless it is 'none'.
            updateTexture: (name, canvas, options) => log.push(['upload', name, canvasIds.get(canvas), options?.orientation ?? 'flipY']),
            width,
            height,
            params,
            isCancelled: () => ++checks > cancelAfter,
        })
    } finally {
        delete globalThis.document
    }
    return { log, checks }
}

const OVERLAYS = ['fibers', 'scratches', 'strayHair']
const OVERLAY_CASES = [
    { params: { seed: 1, density: 1, alpha: 1 }, width: 64, height: 64 },
    { params: { seed: 7, density: 0.25, alpha: 0.5 }, width: 97, height: 41 },
    { params: { seed: 0, density: 0.6 }, width: 64, height: 64 },
    { params: {}, width: 48, height: 80 },
    { params: { seed: 3, density: 1 }, width: 64, height: 64, cancelAfter: 1 },
    { params: { seed: 3, density: 1 }, width: 64, height: 64, cancelAfter: 5 },
]

test('each worm overlay draws what its inline implementation drew, call for call', async () => {
    for (const name of OVERLAYS) {
        const reference = (await importFrom(referenceRoot, `shaders/effects/filter/${name}/definition.js`)).default
        const current = (await importFrom(REPO_ROOT, `shaders/effects/filter/${name}/definition.js`)).default
        assert.notEqual(reference, current)
        for (const overlay of OVERLAY_CASES) {
            const label = `${name} ${JSON.stringify(overlay)}`
            const before = await traceLog(reference, overlay)
            const now = await traceLog(current, overlay)
            assert.ok(before.log.length > 3, `${label}: the reference draws`)
            assert.equal(now.log.length, before.log.length, `${label}: the same number of calls`)
            assert.deepEqual(now.log, before.log, `${label}: the same calls in the same order`)
            assert.equal(now.checks, before.checks, `${label}: the same cancellation checks`)
        }
    }
})

test('each worm overlay keeps its class, its methods and its own properties', async () => {
    for (const name of OVERLAYS) {
        const reference = (await importFrom(referenceRoot, `shaders/effects/filter/${name}/definition.js`)).default
        const current = (await importFrom(REPO_ROOT, `shaders/effects/filter/${name}/definition.js`)).default
        assert.equal(current.constructor.name, reference.constructor.name)
        assert.deepEqual(Object.keys(current), Object.keys(reference), `${name}: the same own properties`)
        assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(current)), Object.getOwnPropertyNames(Object.getPrototypeOf(reference)))
        assert.deepEqual(capabilityUseOf(current), { dependencies: ['seed', 'density'], resources: [] }, `${name}: its scalar dependencies, declared`)
    }
})

// ---------------------------------------------------------------------------
// synth/media: its state, receiver and uniforms, against the inline original.

test('synth/media keeps its state, receiver and returned uniforms', async () => {
    const Reference = (await importFrom(referenceRoot, 'shaders/effects/synth/media/definition.js')).default
    const Current = (await importFrom(REPO_ROOT, 'shaders/effects/synth/media/definition.js')).default
    const run = (Media) => {
        const media = new Media()
        const trace = []
        media.setMediaDimensions(640, 480)
        trace.push(['before init', { ...media.state }, media.onUpdate()])
        media.onInit()
        trace.push(['after init', { ...media.state }, media.onUpdate()])
        media.setMediaDimensions(1920, 1080)
        trace.push(['after set', { ...media.state }, media.onUpdate()])
        media.setMediaDimensions(0, undefined)
        trace.push(['zero', { ...media.state }, media.onUpdate()])
        const borrowed = { state: {} }
        Media.prototype.setMediaDimensions.call(borrowed, 3, 4)
        trace.push(['receiver', borrowed.state, Media.prototype.onUpdate.call(borrowed)])
        return { trace, keys: Object.keys(media), methods: Object.getOwnPropertyNames(Media.prototype) }
    }
    assert.deepEqual(run(Current), run(Reference))
})

// ---------------------------------------------------------------------------
// The registry and instantiation.

const pkg = (func, capabilities, overrides = {}) => ({
    format: 'noisemaker-portable-effect',
    version: 2,
    name: func,
    func,
    namespace: 'user',
    globals: {
        seed: { type: 'int', default: 1, uniform: 'seed' },
        tint: { type: 'vec3', default: [1, 0.5, 0.25], uniform: 'tint' },
        alpha: { type: 'float', default: 0.5, uniform: 'alpha' },
        size: { type: 'vec2', default: [8, 8], uniform: 'imageSize' },
    },
    textures: { overlayTex: { width: 'screen', height: 'screen', format: 'rgba8' } },
    passes: { main: { program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } } },
    capabilities,
    shaders: { main: { glsl: FRAGMENT } },
    ...overrides,
})

const stripesDescriptor = (id = 'example/stripes', version = 1) => ({
    id,
    version,
    options: { count: { type: 'integer', minimum: 1, required: true } },
    bindings: {
        parameters: { seed: { types: ['int'], required: true }, tint: { types: ['vec3'] }, alpha: { types: ['float'] } },
        textures: { target: { required: true } },
    },
    dependencies: { parameters: ['tint', 'alpha'], resources: ['target'] },
    uploadOrientation: 'none',
    methods: ['stripeCount'],
})

const stripes = (version = 1) => ({ id: 'example/stripes', version, options: { count: 3 },
    bindings: { parameters: { seed: 'seed', tint: 'tint', alpha: 'alpha' }, textures: { target: 'overlayTex' } } })

// A third-party provider, as a fixture host would write it. Per-node state is
// keyed by the node's lifetime signal; resources are released when it ends.
function stripesProvider(events) {
    return {
        id: 'example/stripes',
        version: 1,
        descriptor: stripesDescriptor(),
        create({ options, bindings, uniforms, host, signal }) {
            events.creates.push({ options, bindings, uniforms, host, signal })
            const perNode = new WeakMap()
            return {
                onInit() { events.hooks.push(['stripes', 'onInit', this]) },
                onUpdate() { events.hooks.push(['stripes', 'onUpdate', this]); return { stripeUniform: options.count, shared: 'stripes' } },
                async asyncInit(context) {
                    events.hooks.push(['stripes', 'asyncInit', this])
                    let state = perNode.get(context.lifetimeSignal)
                    if (!state) {
                        state = { node: events.nodes.length }
                        events.nodes.push(state)
                        perNode.set(context.lifetimeSignal, state)
                        events.allocated++
                        context.lifetimeSignal.addEventListener('abort', () => { events.released++ })
                    }
                    const run = events.runs.length
                    events.runs.push({ run, state, params: context.params, width: context.width, regeneration: context.signal, lifetime: context.lifetimeSignal })
                    const source = { getContext: () => null, drawnFor: state.node, run }
                    context.updateTexture(bindings.textures.target, source)
                    await events.gate?.()
                    context.updateTexture(bindings.textures.target, source)
                },
                onDestroy() { events.hooks.push(['stripes', 'onDestroy', this]) },
                methods: { stripeCount() { return [this, options.count] } },
            }
        },
    }
}

const second = events => ({
    id: 'example/second',
    version: 1,
    descriptor: { id: 'example/second', version: 1, dependencies: { parameters: [], resources: [] } },
    create() {
        return {
            onInit() { events.hooks.push(['second', 'onInit', this]) },
            onUpdate() { events.hooks.push(['second', 'onUpdate', this]); return { shared: 'second' } },
            async asyncInit() { events.hooks.push(['second', 'asyncInit', this]) },
            onDestroy() { events.hooks.push(['second', 'onDestroy', this]) },
        }
    },
})

const freshEvents = () => ({ creates: [], hooks: [], runs: [], nodes: [], allocated: 0, released: 0 })

test('a provider registers once for each ID and version, with a data descriptor of the same ID and version', () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    const provider = registry.register(stripesProvider(events))
    assert.equal(registry.get('example/stripes', 1), provider)
    const refused = (registration, code) => assert.throws(() => registry.register(registration), error => {
        assert.deepEqual(error.diagnostics.map(entry => entry.code), [code])
        return true
    })
    refused(stripesProvider(events), 'duplicate-provider')
    refused({ ...stripesProvider(events), version: 2 }, 'invalid-descriptor')
    refused({ ...stripesProvider(events), descriptor: stripesDescriptor('example/stripes', 3), version: 3, create: 'stripes.js' }, 'invalid-provider')
    refused({ id: 'example/bad', version: 1, descriptor: { id: 'example/bad', version: 1, create() {} }, create() {} }, 'function-value')
    assert.deepEqual(registry.list().map(entry => [entry.id, entry.version]), [['example/stripes', 1]])
    assert.ok(getPortableCapability('noisemaker/worm-overlay', 1), 'the engine registers its worm overlay')
    assert.ok(getPortableCapability('noisemaker/media-dimensions', 1), 'the engine registers its media dimensions')
})

test('a missing, incompatible or misfitting provider refuses the package, and no registry changes', async () => {
    const registry = createCapabilityRegistry()
    registry.register(stripesProvider(freshEvents()))
    const renderer = new CanvasRenderer()
    const cases = [
        [pkg('capabilityMissing', [{ id: 'example/absent', version: 1 }]), 'missing-provider', 'capabilities.0'],
        [pkg('capabilityIncompatible', [stripes(2)]), 'incompatible-provider', 'capabilities.0.version'],
        [pkg('capabilityMisfit', [{ ...stripes(), options: {} }]), 'missing-option', 'capabilities.0.options.count'],
        [pkg('capabilityMisbound', [{ ...stripes(), bindings: { ...stripes().bindings, parameters: { seed: 'tint' } } }]), 'invalid-binding', 'capabilities.0.bindings.parameters.seed'],
    ]
    for (const [raw, code, at] of cases) {
        await assert.rejects(() => renderer.registerPortableEffect(raw, { capabilities: registry }), error => {
            assert.ok(error.diagnostics.some(entry => entry.code === code && entry.path === at), `${raw.func}: ${JSON.stringify(error.diagnostics)}`)
            return true
        })
        assert.equal(getEffect(`user.${raw.func}`), undefined, `${raw.func}: no effect`)
        assert.equal(isStarterOp(`user.${raw.func}`), false, `${raw.func}: no starter`)
        assert.equal(renderer.resolveEnumValue?.(`user.${raw.func}`) ?? null, null, `${raw.func}: no enum`)
    }
    assert.equal(renderer.loadedEffects.size, 0)
    const resolved = resolvePortableCapabilities({ capabilities: [stripes()], globals: pkg('x', []).globals }, registry)
    assert.deepEqual(resolved.diagnostics, [], 'the same declaration resolves')
})

test('a failing provider refuses the package, and the providers created before it are told to stop', () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(stripesProvider(events))
    registry.register({ id: 'example/broken', version: 1, descriptor: { id: 'example/broken', version: 1 }, create() { throw new Error('no canvas') } })
    registry.register({ id: 'example/odd', version: 1, descriptor: { id: 'example/odd', version: 1, methods: ['twist'] }, create: () => ({ onInit: 'later' }) })
    const definition = (capabilities) => ({ ...pkg('capabilityFailing', capabilities), passes: undefined })
    assert.throws(() => instantiatePortableEffect({ definition: definition([stripes(), { id: 'example/broken', version: 1 }]), shaders: {} }, { capabilities: registry }), error => {
        assert.deepEqual(error.diagnostics.map(entry => [entry.code, entry.path]), [['failed-provider', 'capabilities.1']])
        return true
    })
    assert.equal(events.creates[0].signal.aborted, true, 'the provider created before the failure is aborted')
    assert.throws(() => instantiatePortableEffect({ definition: definition([{ id: 'example/odd', version: 1 }]), shaders: {} }, { capabilities: registry }), error => {
        assert.deepEqual(error.diagnostics.map(entry => entry.code), ['invalid-provider', 'invalid-provider'])
        return true
    })
    assert.throws(() => instantiatePortableEffect({ definition: { ...definition([]), namespace: 'filter' }, shaders: {} }, { capabilities: registry }), /namespace filter is the engine's/)
    assert.ok(instantiatePortableEffect({ definition: { ...definition([]), namespace: 'filter' }, shaders: {} }, { capabilities: registry, registrationContext: CATALOG_CONTEXT }))
})

test('providers compose in declaration order onto the registered effect, which is every hook\'s receiver', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(stripesProvider(events))
    registry.register(second(events))
    const host = { createCanvas: () => null }
    const renderer = new CanvasRenderer()
    const effect = await renderer.registerPortableEffect(pkg('capabilityOrder', [stripes(), { id: 'example/second', version: 1 }]), { capabilities: registry, host })
    const instance = effect.instance
    assert.equal(events.creates.length, 1, 'create runs once for the registered effect')
    assert.equal(events.creates[0].host, host, 'the host services reach the provider')
    assert.deepEqual(events.creates[0].uniforms, { seed: 'seed', tint: 'tint', alpha: 'alpha' })
    instance.onInit()
    assert.deepEqual(instance.onUpdate({}), { stripeUniform: 3, shared: 'second' }, 'a later provider\'s uniform binds over an earlier one\'s')
    await instance.asyncInit({ updateTexture() {}, width: 4, height: 4, params: {}, isCancelled: () => false, signal: new AbortController().signal, lifetimeSignal: new AbortController().signal })
    instance.onDestroy()
    assert.deepEqual(events.hooks.map(([name, hook]) => `${name}.${hook}`), [
        'stripes.onInit', 'second.onInit', 'stripes.onUpdate', 'second.onUpdate',
        'stripes.asyncInit', 'second.asyncInit', 'second.onDestroy', 'stripes.onDestroy',
    ])
    assert.ok(events.hooks.every(([, , receiver]) => receiver === instance), 'every hook runs on the registered effect')
    assert.deepEqual(instance.stripeCount(), [instance, 3], 'a declared method runs on the registered effect')
    assert.deepEqual(capabilityUseOf(instance), { dependencies: ['tint', 'alpha'], resources: ['overlayTex'] })
    assert.equal(getEffect('user.capabilityOrder'), instance)
})

// ---------------------------------------------------------------------------
// The production pipeline: the one lifecycle contract.

class RecordingBackend extends Backend {
    constructor() {
        super(null)
        this.uploads = []
    }

    async init() {}
    createTexture(id, spec) { this.textures.set(id, { id, width: spec.width, height: spec.height, format: spec.format, usage: spec.usage }); return this.textures.get(id) }
    createTexture3D(id, spec) { this.textures.set(id, { id, ...spec }); return this.textures.get(id) }
    destroyTexture() {}
    // A program is kept by its id, as a backend keeps it, with its source.
    async compileProgram(id, spec) {
        const program = { handle: id, type: spec.type, source: spec.fragment ?? spec.source ?? spec.glsl ?? null }
        this.programs.set(id, program)
        return program
    }
    executePass(pass) { this.executed?.push(pass) }
    beginFrame() {}
    endFrame() {}
    resize() {}
    async readPixels() { return { width: 1, height: 1, data: new Uint8Array(4) } }
    updateTextureFromSource(id, source, options) { this.uploads.push({ id, node: source.drawnFor, run: source.run, flipY: options.flipY }) }
    getName() { return 'Recording' }
    static isAvailable() { return true }
}

async function pipelineFor(source) {
    const graph = compileGraph(source)
    graph.renderSurface = null
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(64, 64)
    return { pipeline, backend }
}

test('under the pipeline: each node has its own state and lifetime, and each pipeline its own init', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(stripesProvider(events))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityNodes', [stripes()]), { capabilities: registry })
    const source = 'search user\ncapabilityNodes().write(o0)\ncapabilityNodes().write(o1)\nrender(o0)'

    const first = await pipelineFor(source)
    await first.pipeline.whenAsyncInitsSettled()
    assert.equal(events.creates.length, 1, 'create runs once for the registered effect, whatever its nodes')
    assert.equal(events.nodes.length, 2, 'each node has its own provider state')
    assert.notEqual(events.runs[0].lifetime, events.runs[1].lifetime)
    assert.deepEqual(first.backend.uploads.map(upload => upload.flipY), [false, false, false, false], 'the declared orientation, none')
    const initsAfterFirst = events.hooks.filter(([, hook]) => hook === 'onInit').length

    const other = await pipelineFor(source)
    await other.pipeline.whenAsyncInitsSettled()
    assert.equal(events.hooks.filter(([, hook]) => hook === 'onInit').length, initsAfterFirst + 1, 'onInit runs once per pipeline')
    assert.equal(events.nodes.length, 4, 'another pipeline\'s nodes have their own state')

    first.pipeline.render(0)
    first.pipeline.render(0.1)
    assert.equal(events.hooks.filter(([, hook]) => hook === 'onUpdate').length, 2, 'onUpdate runs once per frame of a pipeline')

    // A resize draws each node again, at the new size, in the same lifetime.
    const runsBefore = events.runs.length
    first.pipeline.resize(32, 16)
    await first.pipeline.whenAsyncInitsSettled()
    const resized = events.runs.slice(runsBefore)
    assert.deepEqual(resized.map(run => run.width), [32, 32])
    assert.ok(resized.every(run => !run.lifetime.aborted), 'a resize keeps each node\'s lifetime')
    assert.equal(events.nodes.length, 4, 'and its state')

    // A recompile ends the old nodes' lifetimes, which releases their resources.
    recompile(first.pipeline, 'search user\ncapabilityNodes().write(o0)\nrender(o0)')
    await first.pipeline.whenAsyncInitsSettled()
    assert.equal(events.released, 2, 'the replaced nodes release what they allocated')
    first.pipeline.dispose()
    other.pipeline.dispose()
    assert.equal(events.released, events.allocated, 'every resource allocated is released')
    assert.equal(events.hooks.filter(([, hook]) => hook === 'onDestroy').length, 2, 'onDestroy runs once per pipeline')
})

test('under the pipeline: a regeneration cancels the one before it, and a cancelled run uploads nothing', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(stripesProvider(events))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityCancel', [stripes()]), { capabilities: registry })
    let release
    events.gate = () => new Promise(resolve => { release = resolve })
    const { pipeline, backend } = await pipelineFor('search user\ncapabilityCancel().write(o0)\nrender(o0)')
    const nodeId = pipeline.graph.passes.find(pass => pass.effectKey === 'user.capabilityCancel').nodeId
    const firstRun = events.runs.at(-1)
    const uploadsBefore = backend.uploads.length
    events.gate = undefined
    pipeline.checkAsyncRegen(nodeId, 'user.capabilityCancel', { tint: [0, 1, 0] })
    await new Promise(resolve => setTimeout(resolve, 350))
    assert.equal(firstRun.regeneration.aborted, true, 'the earlier regeneration is cancelled')
    assert.equal(firstRun.lifetime.aborted, false, 'the node lives on')
    release()
    await pipeline.whenAsyncInitsSettled()
    const stale = backend.uploads.slice(uploadsBefore).filter(upload => upload.run === firstRun.run)
    assert.equal(stale.length, 0, 'the cancelled run uploads nothing after its cancellation')
    assert.ok(backend.uploads.some(upload => upload.run === events.runs.at(-1).run), 'the new run uploads')
    pipeline.dispose()
})

test('under the pipeline: declared dependencies compare by value, vectors and alpha included, and nothing else regenerates', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(stripesProvider(events))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityDepends', [stripes()]), { capabilities: registry })
    const { pipeline } = await pipelineFor('search user\ncapabilityDepends().write(o0)\nrender(o0)')
    const nodeId = pipeline.graph.passes.find(pass => pass.effectKey === 'user.capabilityDepends').nodeId
    const runs = async (values) => {
        const before = events.runs.length
        pipeline.checkAsyncRegen(nodeId, 'user.capabilityDepends', values)
        await pipeline.whenAsyncInitsSettled()
        return events.runs.length - before
    }
    // The first draw reads the pipeline's global uniforms, as every async
    // overlay's does, so the step's own values may draw it once more.
    await runs({ tint: [1, 0.5, 0.25], alpha: 0.5 })
    assert.equal(await runs({ tint: [1, 0.5, 0.25], alpha: 0.5 }), 0, 'the values it was drawn with')
    assert.equal(await runs({ tint: [0, 1, 0], alpha: 0.5 }), 1, 'a vector changes value')
    assert.equal(await runs({ tint: [0, 1, 0], alpha: 0.5 }), 0, 'the same vector in a new array')
    assert.equal(await runs({ tint: [0, 1, 0], alpha: 0.9 }), 1, 'alpha, which this provider declares')
    assert.equal(await runs({ seed: 42, tint: [0, 1, 0], alpha: 0.9 }), 0, 'seed, which it does not')
    assert.equal(await runs({ tint: { type: 'Oscillator' }, alpha: 0.9 }), 0, 'an automation is not a value')
    pipeline.dispose()

    // A migrated built-in declares the dependencies it observed: seed and density, not alpha.
    const fibers = (await importFrom(REPO_ROOT, 'shaders/effects/filter/fibers/definition.js')).default
    assert.deepEqual(capabilityUseOf(fibers), { dependencies: ['seed', 'density'], resources: [] })
})

test('under the pipeline: an asyncInit that fails leaves the pipeline rendering', async () => {
    const registry = createCapabilityRegistry()
    registry.register({
        id: 'example/failing', version: 1,
        descriptor: { id: 'example/failing', version: 1 },
        create: () => ({ async asyncInit() { throw new Error('the canvas is gone') } }),
    })
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityFails', [{ id: 'example/failing', version: 1 }]), { capabilities: registry })
    const logged = []
    const error = console.error
    console.error = (...args) => logged.push(args.join(' '))
    try {
        const { pipeline } = await pipelineFor('search user\ncapabilityFails().write(o0)\nrender(o0)')
        await pipeline.whenAsyncInitsSettled()
        assert.ok(logged.some(line => line.includes('the canvas is gone')), 'the failure is reported')
        pipeline.render(0)
        pipeline.render(0.1)
        pipeline.dispose()
    } finally {
        console.error = error
    }
})

// ---------------------------------------------------------------------------
// The provider fixtures that --pins --check --providers renders.

function readPackage(directory, prefix = '', files = new Map()) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) readPackage(path.join(directory, entry.name), name, files)
        else files.set(name, new Uint8Array(fs.readFileSync(path.join(directory, entry.name))))
    }
    return files
}
const text = bytes => new TextDecoder().decode(bytes).replace(/\r\n/g, '\n')

test('each provider fixture is its effect\'s declaration with the provider, and the effect\'s own shaders', async () => {
    const cases = providerCases(REPO_ROOT)
    assert.deepEqual(cases.map(entry => entry.effectId), ['filter/fibers', 'filter/scratches', 'filter/strayHair', 'synth/media'])
    for (const { effectId, packageId, renderCase } of cases) {
        const directory = path.join(REPO_ROOT, PROVIDERS_RELATIVE, effectId.replace('/', '-'))
        const files = readPackage(directory)
        const loaded = loadPortablePackage(files)
        assert.deepEqual(loaded.diagnostics, [], effectId)
        assert.equal(loaded.capabilities.complete, false, `${effectId}: the package carries no descriptor; its provider's is the engine's`)

        // The declaration is the effect's, in the version 2 form, with the provider.
        const mod = await importFrom(REPO_ROOT, `shaders/effects/${effectId}/definition.js`)
        const instance = typeof mod.default === 'function' ? new mod.default() : mod.default
        const declaration = {}
        for (const key of PACKAGE_KEYS) if (instance[key] !== undefined) declaration[key] = instance[key]
        const { capabilities, namespace, ...rest } = JSON.parse(text(files.get('definition.json')))
        const expected = toPortablePackage(JSON.parse(JSON.stringify(declaration)))
        delete expected.namespace
        assert.deepEqual(rest, expected, `${effectId}: the fixture is the effect's declaration`)
        assert.equal(namespace, 'user')
        assert.equal(capabilities.length, 1)

        // Its shader files are the effect's own.
        for (const [name, bytes] of packageFiles(loaded)) {
            if (name === 'definition.json') continue
            assert.equal(text(bytes), text(fs.readFileSync(path.join(REPO_ROOT, 'shaders/effects', effectId, name))), `${effectId}: ${name}`)
        }

        // Its case is valid, and its program runs the package, not the catalog's
        // effect, which is registered beside it as the page registers it.
        assert.deepEqual(pinCaseErrors(renderCase, packageId), [], effectId)
        const renderer = new CanvasRenderer()
        for (const id of new Set([...renderCase.effects.filter(entry => entry !== packageId), effectId])) {
            const [catalogNamespace, name] = id.split('/')
            if (getEffect(`${catalogNamespace}.${name}`)) continue
            const catalogModule = await importFrom(REPO_ROOT, `shaders/effects/${id}/definition.js`)
            const catalogInstance = typeof catalogModule.default === 'function' ? new catalogModule.default() : catalogModule.default
            const choices = renderer.registerEffectWithRuntime({ namespace: catalogNamespace, name, instance: catalogInstance })
            if (choices) await mergeIntoEnums(choices)
            if (catalogNamespace === 'synth') registerStarterOps([`synth.${name}`])
        }
        await renderer.registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders })
        const graph = compileGraph(renderCase.dsl)
        const keys = new Set(graph.passes.map(pass => pass.effectKey).filter(Boolean))
        assert.ok(keys.has(packageId.replace('/', '.')), `${effectId}: the program runs ${packageId}: ${[...keys]}`)
        assert.ok(!keys.has(effectId.replace('/', '.')), `${effectId}: and not the catalog's effect`)
    }
})

// ---------------------------------------------------------------------------
// The capability examples under shaders/portable/examples/.

const EXAMPLES = path.join(REPO_ROOT, 'shaders/portable/examples')

test('the overlay example declares the engine\'s worm overlay with a recipe of its own, and draws', async () => {
    const loaded = loadPortablePackage(readPackage(path.join(EXAMPLES, 'overlay-threads')),
        { capabilityDescriptors: [getPortableCapability('noisemaker/worm-overlay', 1).descriptor] })
    assert.deepEqual(loaded.diagnostics, [])
    assert.deepEqual(loaded.capabilities, { complete: true, unresolved: [] })
    const effect = await new CanvasRenderer().registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders })
    const drawn = await traceLog(effect.instance, { params: { seed: 2, density: 0.8 }, width: 64, height: 64 })
    assert.ok(drawn.log.some(([, call]) => call === 'stroke'), 'it draws strokes')
    assert.ok(drawn.log.some(([call, name]) => call === 'upload' && name === 'overlayTex'), 'it uploads its overlay')
    assert.deepEqual(capabilityUseOf(effect.instance), { dependencies: ['seed', 'density'], resources: [] })
})

test('the host-provider example: a host registers its provider, and the package that carries its descriptor loads and draws', async () => {
    const { gradientProvider, GRADIENT_DESCRIPTOR } = await import(pathToFileURL(path.join(EXAMPLES, 'host-provider/provider.js')).href)
    const loaded = loadPortablePackage(readPackage(path.join(EXAMPLES, 'host-provider/package')))
    assert.deepEqual(loaded.diagnostics, [])
    assert.deepEqual(loaded.capabilities, { complete: true, unresolved: [] }, 'the package\'s descriptor file checks its declaration')
    assert.deepEqual(loaded.capabilityDescriptors, [JSON.parse(JSON.stringify(GRADIENT_DESCRIPTOR))], 'the file is the provider\'s descriptor')

    const registry = createCapabilityRegistry()
    registry.register(gradientProvider)
    const log = []
    const host = { createCanvas: (width, height) => {
        const canvas = recordingCanvas(log, 'host')
        canvas.width = width
        canvas.height = height
        return canvas
    } }
    const effect = await new CanvasRenderer().registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders }, { capabilities: registry, host })
    const uploads = []
    await effect.instance.asyncInit({
        updateTexture: (name, source, options) => uploads.push([name, source.width, options]),
        width: 4, height: 3, params: { top: [1, 0, 0], bottom: [0, 0, 1] }, isCancelled: () => false,
        signal: new AbortController().signal, lifetimeSignal: new AbortController().signal,
    })
    assert.deepEqual(log.filter(([, call]) => call === 'fillStyle=').map(([, , value]) => value),
        ['rgb(255, 0, 0)', 'rgb(128, 0, 128)', 'rgb(0, 0, 255)'], 'a row for each line of the texture, from top to bottom')
    assert.deepEqual(uploads, [['washTex', 4, { orientation: 'flipY' }]], 'one upload, in the declared orientation')
    assert.deepEqual(capabilityUseOf(effect.instance), { dependencies: ['top', 'bottom'], resources: ['washTex'] }, 'its colors and its texture are dependencies')
})

test('a package registered through the public API runs the engine\'s worm overlay, with no catalog change', async () => {
    const definition = pkg('capabilityFibers', [{
        id: 'noisemaker/worm-overlay',
        version: 1,
        options: { recipe: (await import('../src/portable/providers/worm-overlay.js')).WORM_OVERLAY_RECIPES.fibers },
        bindings: { parameters: { seed: 'seed' }, textures: { overlay: 'overlayTex' } },
    }])
    const effect = await new CanvasRenderer().registerPortableEffect(definition)
    const fibers = (await importFrom(REPO_ROOT, 'shaders/effects/filter/fibers/definition.js')).default
    const overlay = { params: { seed: 4, density: 0.5 }, width: 64, height: 64 }
    assert.deepEqual((await traceLog(effect.instance, overlay)).log, (await traceLog(fibers, overlay)).log,
        'the package draws what filter/fibers draws')
    assert.deepEqual(capabilityUseOf(effect.instance), { dependencies: ['seed'], resources: [] }, 'the bound dependency roles')
})

// ---------------------------------------------------------------------------
// More of the lifecycle contract.

// A catalog effect with its shader files attached, as the catalog's loader attaches them.
async function catalogEffect(id) {
    const mod = await importFrom(REPO_ROOT, `shaders/effects/${id}/definition.js`)
    const instance = typeof mod.default === 'function' ? new mod.default() : mod.default
    const shaders = {}
    const keys = { '.glsl': 'glsl', '.vert': 'vertex', '.frag': 'fragment', '.wgsl': 'wgsl' }
    for (const language of ['glsl', 'wgsl']) {
        const directory = path.join(REPO_ROOT, 'shaders/effects', id, language)
        for (const file of fs.readdirSync(directory)) {
            const extension = path.extname(file)
            const program = path.basename(file, extension);
            (shaders[program] ??= {})[keys[extension]] = fs.readFileSync(path.join(directory, file), 'utf8')
        }
    }
    instance.shaders = shaders
    return instance
}

async function registerCatalogEffect(id) {
    const [namespace, name] = id.split('/')
    if (getEffect(`${namespace}.${name}`)?.shaders) return
    const choices = new CanvasRenderer().registerEffectWithRuntime({ namespace, name, instance: await catalogEffect(id) })
    if (choices) await mergeIntoEnums(choices)
    if (namespace === 'synth') registerStarterOps([`${namespace}.${name}`])
}

// A provider that records its runs and its init, for the tests below.
function recordingProvider(id, events, { methods = [], onInit, resources = [] } = {}) {
    return {
        id,
        version: 1,
        descriptor: {
            id, version: 1,
            bindings: { parameters: { tint: { types: ['vec3'] } }, textures: { target: {} } },
            dependencies: { parameters: ['tint'], resources },
            uploadOrientation: 'flipY',
            methods,
        },
        create() {
            return {
                onInit() { if (onInit) onInit(); events.hooks.push([id, 'onInit']) },
                async asyncInit(context) { events.runs.push({ id, lifetime: context.lifetimeSignal, regeneration: context.signal }) },
                methods: Object.fromEntries(methods.map(name => [name, () => id])),
            }
        },
    }
}

const recordingDeclaration = id => ({ id, version: 1, bindings: { parameters: { tint: 'tint' }, textures: { target: 'overlayTex' } } })

test('under the pipeline: a resource dependency draws its node again when its texture is allocated again', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(recordingProvider('example/sized', events, { resources: ['target'] }))
    registry.register(recordingProvider('example/unsized', events))
    const sized = overrides => pkg(overrides.func, [recordingDeclaration(overrides.id)], {
        globals: { ...pkg('x', []).globals, cells: { type: 'int', default: 8, uniform: 'cells' } },
        textures: { overlayTex: { width: { param: 'cells', default: 8 }, height: { param: 'cells', default: 8 }, format: 'rgba8' } },
    })
    await new CanvasRenderer().registerPortableEffect(sized({ func: 'capabilitySized', id: 'example/sized' }), { capabilities: registry })
    await new CanvasRenderer().registerPortableEffect(sized({ func: 'capabilityUnsized', id: 'example/unsized' }), { capabilities: registry })
    for (const [func, expected] of [['capabilitySized', 1], ['capabilityUnsized', 0]]) {
        const { pipeline } = await pipelineFor(`search user\n${func}().write(o0)\nrender(o0)`)
        await pipeline.whenAsyncInitsSettled()
        const before = events.runs.length
        pipeline.recreateTextures({ cells: 16 })
        await pipeline.whenAsyncInitsSettled()
        assert.equal(events.runs.length - before, expected, `${func}: a texture allocated again at a new size`)
        const settled = events.runs.length
        pipeline.recreateTextures({ cells: 16 })
        await pipeline.whenAsyncInitsSettled()
        assert.equal(events.runs.length - settled, 0, `${func}: the same size allocates nothing, and draws nothing`)
        pipeline.dispose()
    }
})

test('under the pipeline: a candidate whose provider fails to init is refused, and the accepted graph runs on as it was', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(recordingProvider('example/good', events))
    registry.register(recordingProvider('example/bad', events, { onInit: () => { throw new Error('no device') } }))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityGood', [recordingDeclaration('example/good')]), { capabilities: registry })
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityBad', [recordingDeclaration('example/bad')]), { capabilities: registry })
    const { pipeline } = await pipelineFor('search user\ncapabilityGood().write(o0)\nrender(o0)')
    await pipeline.whenAsyncInitsSettled()
    const accepted = pipeline.graph
    const acceptedRun = events.runs.at(-1)
    const logged = []
    const error = console.error
    console.error = (...args) => logged.push(args.join(' '))
    let result
    try {
        result = recompile(pipeline, 'search user\ncapabilityBad().write(o0)\nrender(o0)')
    } finally {
        console.error = error
    }
    assert.ok(!result, 'the candidate is refused')
    assert.ok(logged.some(line => line.includes('no device')), 'the failure is reported')
    assert.equal(pipeline.graph, accepted, 'the accepted graph is still the pipeline\'s')
    assert.equal(acceptedRun.lifetime.aborted, false, 'the accepted node lives on')
    pipeline.render(0)
    pipeline.render(0.1)
    pipeline.dispose()
    assert.equal(acceptedRun.lifetime.aborted, true, 'and ends with the pipeline')
})

test('under the pipeline: the media provider fixture keeps synth/media\'s size state and uniform precedence', async () => {
    const files = readPackage(path.join(REPO_ROOT, PROVIDERS_RELATIVE, 'synth-media'))
    const loaded = loadPortablePackage(files)
    if (!getEffect('user.media')) await new CanvasRenderer().registerPortableEffect({ ...loaded.definition, shaders: loaded.shaders })
    await registerCatalogEffect('synth/media')
    const run = async (namespace) => {
        const effect = getEffect(`${namespace}.media`)
        effect.setMediaDimensions(320, 200)
        const { pipeline, backend } = await pipelineFor(`search ${namespace}\nmedia().write(o0)\nrender(o0)`)
        const trace = [['init', { ...effect.state }]]
        backend.executed = []
        pipeline.render(0)
        trace.push(['frame', pipeline._runtimeUniforms.get(`${namespace}.media`), backend.executed.find(pass => pass.effectFunc === 'media')?.uniforms.imageSize])
        effect.setMediaDimensions(640, 480)
        pipeline.render(0.1)
        trace.push(['set', pipeline._runtimeUniforms.get(`${namespace}.media`)])
        pipeline.dispose()
        return trace
    }
    const provided = await run('user')
    assert.deepEqual(provided, await run('synth'), 'the package and the catalog\'s effect keep the same state and uniforms')
    assert.deepEqual(provided[0], ['init', { imageWidth: 1, imageHeight: 1 }], 'onInit sets the size, after the host\'s earlier call')
    assert.deepEqual(provided[2], ['set', { imageSize: [640, 480] }], 'setMediaDimensions reaches onUpdate')
    assert.deepEqual(provided[1][2], [1024, 1024], 'the pass keeps its own imageSize, which binds over the hook\'s')
})

test('a fixture host registers its provider in the engine\'s registry, and an unfamiliar package loads and draws, with no catalog change', async () => {
    const { gradientProvider } = await import(pathToFileURL(path.join(EXAMPLES, 'host-provider/provider.js')).href)
    await registerCatalogEffect('synth/solid')
    const catalog = () => Object.keys(getAllEffects()).filter(key => !key.startsWith('user')).sort()
    const before = catalog()
    if (!getPortableCapability('example/gradient', 1)) registerPortableCapability(gradientProvider)
    const loaded = loadPortablePackage(readPackage(path.join(EXAMPLES, 'host-provider/package')))
    const host = { createCanvas: (width, height) => {
        const canvas = recordingCanvas([], 'host')
        canvas.width = width
        canvas.height = height
        return canvas
    } }
    const first = new CanvasRenderer()
    const effect = await first.registerPortableEffect({ ...loaded.definition, func: 'gradientWashHost', shaders: loaded.shaders }, { host })
    const second = new CanvasRenderer()
    assert.equal(getEffect('user.gradientWashHost'), effect.instance, 'every renderer of the realm finds the registered effect')
    // Each renderer runs its own pipeline of the program. A step parameter
    // that one renderer applies draws its own node again, and not the other's.
    const program = 'search user, synth\nsolid().gradientWashHost().write(o0)\nrender(o0)'
    const runs = []
    for (const renderer of [first, second]) {
        const { pipeline, backend } = await pipelineFor(program)
        renderer._pipeline = pipeline
        await pipeline.whenAsyncInitsSettled()
        runs.push({ renderer, pipeline, backend })
    }
    const washed = ({ backend }) => backend.uploads.filter(upload => upload.id.endsWith('_washTex')).length
    assert.deepEqual(runs.map(washed), [1, 1], 'each renderer\'s pipeline draws the package\'s node')
    const step = runs[0].pipeline.graph.passes.find(pass => pass.effectKey === 'user.gradientWashHost')
    first.applyStepParameterValues({ [`step_${step.stepIndex ?? 1}`]: { top: [1, 1, 1], bottom: [0, 0, 0] } })
    await runs[0].pipeline.whenAsyncInitsSettled()
    await runs[1].pipeline.whenAsyncInitsSettled()
    assert.deepEqual(runs.map(washed), [2, 1], 'the renderer that applied new colors draws again; the other does not')
    for (const { pipeline } of runs) pipeline.dispose()
    assert.deepEqual(catalog(), before, 'the catalog is as it was')
})

test('a tool checks a package against its carried descriptor in a process that has no provider code', () => {
    const script = `
        import fs from 'node:fs'
        import path from 'node:path'
        import { pathToFileURL } from 'node:url'
        const [root, packageDir] = process.argv.slice(1)
        const { loadPortablePackage } = await import(pathToFileURL(path.join(root, 'shaders/src/portable/package.js')).href)
        const files = new Map()
        const walk = (dir, prefix) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const name = prefix ? prefix + '/' + entry.name : entry.name
            if (entry.isDirectory()) walk(path.join(dir, entry.name), name)
            else files.set(name, new Uint8Array(fs.readFileSync(path.join(dir, entry.name))))
        } }
        walk(packageDir, '')
        const loaded = loadPortablePackage(files)
        console.log(JSON.stringify({ diagnostics: loaded.diagnostics, capabilities: loaded.capabilities }))
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, REPO_ROOT, path.join(EXAMPLES, 'host-provider/package')], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { diagnostics: [], capabilities: { complete: true, unresolved: [] } })
})

test('a provider\'s methods are new names on the effect, and a recipe the overlay cannot draw is refused', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(recordingProvider('example/first', events, { methods: ['reset'] }))
    registry.register(recordingProvider('example/second', events, { methods: ['reset'] }))
    assert.throws(() => instantiatePortableEffect({ definition: pkg('capabilityMethods', [recordingDeclaration('example/first'), recordingDeclaration('example/second')]), shaders: {} },
        { capabilities: registry }), error => {
        assert.deepEqual(error.diagnostics.map(entry => [entry.code, entry.path]), [['duplicate-method', 'capabilities.1']])
        return true
    })
    assert.throws(() => registry.register(recordingProvider('example/private', events, { methods: ['_configOnUpdate'] })), error => {
        assert.deepEqual(error.diagnostics.map(entry => [entry.code, entry.path]), [['invalid-name', 'descriptor.methods.0']])
        return true
    })
    const { WORM_OVERLAY_RECIPES } = await import('../src/portable/providers/worm-overlay.js')
    const { color: _color, ...colorless } = WORM_OVERLAY_RECIPES.fibers
    await assert.rejects(() => new CanvasRenderer().registerPortableEffect(pkg('capabilityColorless', [{
        id: 'noisemaker/worm-overlay', version: 1, options: { recipe: { ...colorless, color: { alpha: 0.5 } } },
        bindings: { parameters: { seed: 'seed' }, textures: { overlay: 'overlayTex' } },
    }])), error => {
        assert.deepEqual(error.diagnostics.map(entry => entry.code), ['failed-provider'])
        assert.match(error.message, /color gives one of random and rgb/)
        return true
    })
    assert.equal(getEffect('user.capabilityColorless'), undefined)
})

test('under the pipeline: NaN regenerates each time, the infinities are values, and a disposed pipeline starts nothing', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(stripesProvider(events))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityNumbers', [stripes()]), { capabilities: registry })
    const { pipeline } = await pipelineFor('search user\ncapabilityNumbers().write(o0)\nrender(o0)')
    const nodeId = pipeline.graph.passes.find(pass => pass.effectKey === 'user.capabilityNumbers').nodeId
    const runs = async (values) => {
        const before = events.runs.length
        pipeline.checkAsyncRegen(nodeId, 'user.capabilityNumbers', values)
        await pipeline.whenAsyncInitsSettled()
        return events.runs.length - before
    }
    assert.equal(await runs({ tint: [NaN, 0, 0] }), 1)
    assert.equal(await runs({ tint: [NaN, 0, 0] }), 1, 'NaN equals nothing, as before dependencies were declared')
    assert.equal(await runs({ tint: [Infinity, 0, 0] }), 1)
    assert.equal(await runs({ tint: [-Infinity, 0, 0] }), 1, 'Infinity and -Infinity are different values')
    assert.equal(await runs({ tint: [-Infinity, 0, 0] }), 0)
    pipeline.dispose()
    const after = events.runs.length
    pipeline.checkAsyncRegen(nodeId, 'user.capabilityNumbers', { tint: [9, 9, 9] })
    await pipeline.whenAsyncInitsSettled()
    assert.equal(events.runs.length, after, 'a disposed pipeline draws nothing')
    assert.equal(pipeline._asyncLifetimes.size, 0, 'and starts no lifetime')
})

test('the renderer\'s compile() rejects a candidate whose provider fails to init, keeps its pipeline, and builds no other', async () => {
    const registry = createCapabilityRegistry()
    const events = freshEvents()
    registry.register(recordingProvider('example/kept', events))
    registry.register(recordingProvider('example/refusing', events, { onInit: () => { throw new Error('no device for this') } }))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityKept', [recordingDeclaration('example/kept')]), { capabilities: registry })
    // The refused package's shader differs, and its program takes the same id as the accepted one's.
    const refusingShader = FRAGMENT.replace('vec4(1.0)', 'vec4(0.0, 0.0, 1.0, 1.0)')
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityRefusing', [recordingDeclaration('example/refusing')],
        { shaders: { main: { glsl: refusingShader } } }), { capabilities: registry })
    const { pipeline, backend } = await pipelineFor('search user\ncapabilityKept().write(o0)\nrender(o0)')
    await pipeline.whenAsyncInitsSettled()
    const accepted = pipeline.graph
    const acceptedPrograms = new Map(backend.programs)
    assert.ok(acceptedPrograms.size > 0)
    const renderer = new CanvasRenderer()
    renderer._pipeline = pipeline
    let built = 0
    renderer._createRuntime = async () => { built++; throw new Error('a new runtime was built') }
    const error = console.error
    console.error = () => {}
    try {
        await assert.rejects(() => renderer.compile('search user\ncapabilityRefusing().write(o0)\nrender(o0)'), /no device for this/)
    } finally {
        console.error = error
    }
    assert.equal(built, 0, 'no other pipeline is built')
    assert.equal(renderer._pipeline, pipeline, 'the renderer keeps its pipeline')
    assert.equal(pipeline.graph, accepted, 'which runs the accepted graph')
    assert.deepEqual([...backend.programs], [...acceptedPrograms], 'with the accepted graph\'s programs')
    assert.ok(![...backend.programs.values()].some(program => program.source?.includes('0.0, 0.0, 1.0, 1.0')), 'and none of the refused one\'s')
    assert.equal(pipeline.isCompiling, false)
    pipeline.dispose()
})

test('onInit runs before a node\'s first asyncInit, on a first init and on a recompile', async () => {
    const registry = createCapabilityRegistry()
    const order = []
    const ordered = id => ({
        id, version: 1,
        descriptor: { id, version: 1, bindings: { parameters: { tint: { types: ['vec3'] } }, textures: { target: {} } }, uploadOrientation: 'flipY' },
        create: () => ({ onInit() { order.push(`${id} onInit`) }, async asyncInit() { order.push(`${id} asyncInit`) } }),
    })
    registry.register(ordered('example/first-init'))
    registry.register(ordered('example/later-init'))
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityFirstInit', [recordingDeclaration('example/first-init')]), { capabilities: registry })
    await new CanvasRenderer().registerPortableEffect(pkg('capabilityLaterInit', [recordingDeclaration('example/later-init')]), { capabilities: registry })
    const { pipeline } = await pipelineFor('search user\ncapabilityFirstInit().write(o0)\nrender(o0)')
    await pipeline.whenAsyncInitsSettled()
    recompile(pipeline, 'search user\ncapabilityLaterInit().write(o0)\nrender(o0)')
    await pipeline.whenAsyncInitsSettled()
    assert.deepEqual(order, ['example/first-init onInit', 'example/first-init asyncInit', 'example/later-init onInit', 'example/later-init asyncInit'])
    pipeline.dispose()
})

test('a method named starter is refused, and a recipe\'s duration is bounded', async () => {
    const events = freshEvents()
    assert.throws(() => createCapabilityRegistry().register(recordingProvider('example/starter', events, { methods: ['starter'] })), error => {
        assert.deepEqual(error.diagnostics.map(entry => [entry.code, entry.path]), [['invalid-name', 'descriptor.methods.0']])
        return true
    })
    const { WORM_OVERLAY_RECIPES } = await import('../src/portable/providers/worm-overlay.js')
    await assert.rejects(() => new CanvasRenderer().registerPortableEffect(pkg('capabilityEndless', [{
        id: 'noisemaker/worm-overlay', version: 1,
        options: { recipe: { ...WORM_OVERLAY_RECIPES.fibers, duration: { base: 10000000 } } },
        bindings: { parameters: { seed: 'seed' }, textures: { overlay: 'overlayTex' } },
    }])), error => {
        assert.ok(error.diagnostics.some(entry => entry.code === 'invalid-option' && entry.path === 'capabilities.0.options.recipe.duration.base'),
            JSON.stringify(error.diagnostics))
        return true
    })
    await assert.rejects(() => new CanvasRenderer().registerPortableEffect(pkg('capabilityDivided', [{
        id: 'noisemaker/worm-overlay', version: 1,
        options: { recipe: { ...WORM_OVERLAY_RECIPES.fibers, duration: { base: 1, modulus: 64, divide: 1e-9 } } },
        bindings: { parameters: { seed: 'seed' }, textures: { overlay: 'overlayTex' } },
    }])), error => {
        assert.ok(error.diagnostics.some(entry => entry.code === 'invalid-option' && entry.path === 'capabilities.0.options.recipe.duration.divide'),
            JSON.stringify(error.diagnostics))
        return true
    })
})
