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
// recording backend: two nodes, two pipelines, resize, recompile, dispose,
// cancellation, by-value dependencies and upload orientation.
//
// Run: node --test shaders/tests/test_portable_capabilities.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
    CanvasRenderer, createCapabilityRegistry, getEffect, getPortableCapability, instantiatePortableEffect,
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
            updateTexture: (name, canvas) => log.push(['upload', name, canvasIds.get(canvas)]),
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
        assert.deepEqual(capabilityUseOf(current), { dependencies: ['seed', 'density'] }, `${name}: its scalar dependencies, declared`)
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
                    events.runs.push({ state, params: context.params, width: context.width, regeneration: context.signal, lifetime: context.lifetimeSignal })
                    const source = { getContext: () => null, drawnFor: state.node }
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
    assert.deepEqual(capabilityUseOf(instance), { dependencies: ['tint', 'alpha'] })
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
    createTexture(id, spec) { this.textures.set(id, { id, width: spec.width, height: spec.height }); return this.textures.get(id) }
    createTexture3D(id, spec) { this.textures.set(id, { id, ...spec }); return this.textures.get(id) }
    destroyTexture() {}
    async compileProgram(id, spec) { return { handle: id, type: spec.type } }
    executePass() {}
    beginFrame() {}
    endFrame() {}
    resize() {}
    async readPixels() { return { width: 1, height: 1, data: new Uint8Array(4) } }
    updateTextureFromSource(id, source, options) { this.uploads.push({ id, node: source.drawnFor, flipY: options.flipY }) }
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
    const stale = backend.uploads.slice(uploadsBefore).filter(upload => upload.node === firstRun.state.node && upload !== backend.uploads.at(-1) && upload !== backend.uploads.at(-2))
    assert.equal(stale.length, 0, 'the cancelled run\'s last upload is dropped')
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
    assert.deepEqual(capabilityUseOf(fibers), { dependencies: ['seed', 'density'] })
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
    assert.deepEqual(capabilityUseOf(effect.instance), { dependencies: ['seed'] }, 'the bound dependency roles')
    assert.equal(registerPortableCapability.length, 1)
})
