/**
 * CanvasRenderer public sink/export seam and pipeline lifecycle tests.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
    CanvasRenderer,
    CanvasSink,
    SinkManager,
    FrameExportQueue
} from '../src/index.js'
import { CanvasSink as DirectCanvasSink, SinkManager as DirectSinkManager } from '../src/runtime/sink.js'
import { FrameExportQueue as DirectFrameExportQueue } from '../src/runtime/frame-export.js'
import { Pipeline } from '../src/runtime/pipeline.js'

/**
 * Minimal stand-in for HTMLCanvasElement, mirroring the DOM's width/height
 * attribute reflection: the properties read the attributes (with the 300x150
 * default) and writing a property updates the attribute.
 */
class FakeCanvasElement {
    constructor() {
        this._attributes = new Map()
        this._width = 300
        this._height = 150
        this._listeners = new Map()
    }

    getAttribute(name) {
        return this._attributes.has(name) ? this._attributes.get(name) : null
    }

    setAttribute(name, value) {
        const text = String(value)
        this._attributes.set(String(name), text)
        if (name === 'width') this._width = Number(text)
        if (name === 'height') this._height = Number(text)
    }

    addEventListener(type, listener) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set())
        this._listeners.get(type).add(listener)
    }

    removeEventListener(type, listener) {
        this._listeners.get(type)?.delete(listener)
    }

    getContext() { return null }
}

for (const dimension of ['width', 'height']) {
    Object.defineProperty(FakeCanvasElement.prototype, dimension, {
        get() { return this[`_${dimension}`] },
        set(value) {
            const next = Number(value)
            this[`_${dimension}`] = next
            this._attributes.set(dimension, String(next))
        },
        configurable: true,
        enumerable: true
    })
}

// CanvasRenderer's constructor consults HTMLCanvasElement.prototype to
// install its dimension observer.
globalThis.HTMLCanvasElement = FakeCanvasElement

const tests = []

function test(name, fn) {
    tests.push({ name, fn })
}

function bareRenderer(pipeline = null) {
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline
    renderer._uniformBindings = new Map()
    renderer._preferWebGPU = false
    renderer._meshCache = new Map()
    renderer._midiState = null
    renderer._audioState = null
    renderer._frameCount = 0
    renderer._isRunning = false
    renderer._isContextLost = false
    renderer._wasRunningBeforeContextLoss = false
    renderer._lifecycleGeneration = 0
    renderer._lastBackendInvalidationGeneration = -1
    return renderer
}

function deferred() {
    let resolve
    let reject
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

async function flushMicrotasks(turns = 3) {
    for (let turn = 0; turn < turns; turn++) await Promise.resolve()
}

function captureWarnings(fn) {
    const warnings = []
    const previousWarn = console.warn
    console.warn = (...args) => warnings.push(args.join(' '))
    try {
        fn()
    } finally {
        console.warn = previousWarn
    }
    return warnings
}

function stalePipeline(events, name) {
    return {
        backend: {},
        resetSceneVolumeAtlasWarnings() {},
        setMidiState() {},
        setAudioState() {},
        dispose(options) { events.push([`${name} dispose`, options]) }
    }
}

function closeCountingPipeline(events = []) {
    const backend = {
        textures: new Map(),
        destroy(options) {
            events.push(['backend destroy', options])
        }
    }
    const pipeline = new Pipeline({ passes: [], textures: new Map() }, backend)
    let closes = 0
    const sink = {
        configure() {},
        submit() { return true },
        close() {
            closes++
            events.push(['sink close'])
        }
    }
    pipeline.addSink(sink)
    return { pipeline, sink, get closes() { return closes } }
}

test('main module exports the generic sink and frame-export types', () => {
    assert.equal(CanvasSink, DirectCanvasSink)
    assert.equal(SinkManager, DirectSinkManager)
    assert.equal(FrameExportQueue, DirectFrameExportQueue)
})

test('renderer sink/export APIs reject use before compilation with stable guidance', () => {
    const renderer = bareRenderer()
    const sink = { configure() {}, submit() {}, close() {} }

    assert.throws(
        () => renderer.addSink(sink),
        { message: 'CanvasRenderer has no active pipeline; compile before adding a sink' }
    )
    assert.throws(
        () => renderer.createFrameExportQueue({ slots: 3 }),
        { message: 'CanvasRenderer has no active pipeline; compile before creating a frame export queue' }
    )
})

test('renderer addSink delegates with the active pipeline receiver and returns its exact lifecycle handle', () => {
    const sink = { configure() {}, submit() {}, close() {} }
    const removal = () => {}
    const pipeline = {
        addSink(candidate) {
            assert.equal(this, pipeline)
            assert.equal(candidate, sink)
            return removal
        }
    }
    const renderer = bareRenderer(pipeline)

    assert.equal(renderer.addSink(sink), removal)
})

test('renderer addSink reports an unsupported active pipeline clearly', () => {
    const renderer = bareRenderer({})

    assert.throws(
        () => renderer.addSink({ configure() {}, submit() {}, close() {} }),
        { message: 'Active Noisemaker pipeline does not support output sinks' }
    )
})

test('renderer sink removal remains idempotent and closes the sink exactly once', () => {
    const { pipeline, getCloses } = (() => {
        const fixture = closeCountingPipeline()
        return { pipeline: fixture.pipeline, getCloses: () => fixture.closes }
    })()
    const renderer = bareRenderer(pipeline)
    let closes = 0
    const remove = renderer.addSink({
        configure() {},
        submit() { return true },
        close() { closes++ }
    })

    remove()
    remove()

    assert.equal(closes, 1)
    assert.equal(getCloses(), 0)
})

test('renderer createFrameExportQueue delegates with the backend receiver and preserves option identity', () => {
    const options = { slots: 2, onError() {} }
    const queue = { close() {} }
    const backend = {
        createFrameExportQueue(candidate) {
            assert.equal(this, backend)
            assert.equal(candidate, options)
            return queue
        }
    }
    const renderer = bareRenderer({ backend })

    assert.equal(renderer.createFrameExportQueue(options), queue)
})

test('renderer createFrameExportQueue returns null when the active backend does not support export', () => {
    assert.equal(bareRenderer({ backend: {} }).createFrameExportQueue({ slots: 3 }), null)
    assert.equal(
        bareRenderer({ backend: { createFrameExportQueue() { return null } } })
            .createFrameExportQueue({ slots: 3 }),
        null
    )
})

test('explicit renderer disposal closes an external sink once through Pipeline.dispose', async () => {
    const events = []
    const fixture = closeCountingPipeline(events)
    const renderer = bareRenderer(fixture.pipeline)

    await renderer.dispose({ loseContext: true })
    await renderer.dispose({ loseContext: true })

    assert.equal(fixture.closes, 1)
    assert.deepEqual(events, [
        ['sink close'],
        ['backend destroy', { skipTextures: true, loseContext: true }]
    ])
    assert.equal(renderer.pipeline, null)
})

test('backend switching closes the old pipeline sink once and resets the canvas', async () => {
    const fixture = closeCountingPipeline()
    const renderer = bareRenderer(fixture.pipeline)
    let resets = 0
    renderer.resetCanvas = () => { resets++ }

    await renderer.switchBackend('wgsl')
    await renderer.switchBackend('wgsl')

    assert.equal(fixture.closes, 1)
    assert.equal(resets, 1)
    assert.equal(renderer.pipeline, null)
})

/** Parent node with the DOM's replaceChild() contract. */
class FakeParentNode {
    constructor() { this.children = [] }

    appendChild(child) {
        child.parentNode = this
        this.children.push(child)
        return child
    }

    replaceChild(next, old) {
        const index = this.children.indexOf(old)
        if (index === -1) throw new Error('NotFoundError: the old child is not a child of this node')
        this.children[index] = next
        next.parentNode = this
        old.parentNode = null
        return old
    }
}

/** Canvas element that cloneNode(false) copies with its id and attributes. */
class ReplaceableCanvasElement extends FakeCanvasElement {
    constructor() {
        super()
        this.id = ''
        this.parentNode = null
    }

    cloneNode() {
        const copy = new ReplaceableCanvasElement()
        copy.id = this.id
        for (const [name, value] of this._attributes) copy.setAttribute(name, value)
        return copy
    }
}

test('preferredBackend reports the requested backend while WebGL2 renders in its place', () => {
    const renderer = bareRenderer({ backend: { getName: () => 'WebGL2' } })
    assert.equal(renderer.preferredBackend, 'glsl')
    renderer._preferWebGPU = true
    assert.equal(renderer.preferredBackend, 'wgsl', 'a WebGPU request that fell back to WebGL2 stays wgsl')
    assert.equal(renderer.backend, 'glsl', 'backend names the backend that renders')
})

test('backend names the pipeline backend, and the request when there is no pipeline', () => {
    const webgpu = bareRenderer({ backend: { getName: () => 'WebGPU' } })
    assert.equal(webgpu.backend, 'wgsl')
    const none = bareRenderer(null)
    assert.equal(none.backend, 'glsl')
    none._preferWebGPU = true
    assert.equal(none.backend, 'wgsl', 'before a compile, backend is the request')
})

function rendererOnCanvas({ withContainer }) {
    const parent = new FakeParentNode()
    const canvas = parent.appendChild(new ReplaceableCanvasElement())
    canvas.id = 'c'
    canvas.width = 64
    canvas.height = 32
    const renderer = bareRenderer(closeCountingPipeline().pipeline)
    renderer._canvas = canvas
    renderer._canvasContainer = withContainer ? parent : null
    renderer._setupContextLossHandlers()
    return { renderer, parent, canvas }
}

for (const withContainer of [false, true]) {
    const setup = withContainer ? 'with canvasContainer' : 'with only the documented options'
    test(`switchBackend ${setup} presents the new backend on a fresh canvas in the same place`, async () => {
        const { renderer, parent, canvas } = rendererOnCanvas({ withContainer })

        await renderer.switchBackend('wgsl')

        const fresh = renderer.canvas
        assert.notEqual(fresh, canvas, 'the old canvas keeps its WebGL2 context type, so it is replaced')
        assert.deepEqual(parent.children, [fresh], 'the fresh canvas is the only child, in the old place')
        assert.equal(canvas.parentNode, null)
        assert.equal(fresh.id, 'c')
        assert.equal(fresh.width, 64)
        assert.equal(fresh.height, 32)
        assert.equal(canvas._listeners.get('webglcontextlost')?.size ?? 0, 0, 'listeners leave the old canvas')
        assert.equal(fresh._listeners.get('webglcontextlost').size, 1, 'listeners move to the fresh canvas')
        assert.equal(renderer.backend, 'wgsl')
        assert.equal(renderer.preferredBackend, 'wgsl')
        assert.equal(renderer.pipeline, null, 'the host compiles again on the new backend')

        await renderer.switchBackend('glsl')
        assert.equal(renderer.preferredBackend, 'glsl')
        assert.notEqual(renderer.canvas, fresh, 'the switch back replaces the WebGPU canvas too')
        assert.deepEqual(parent.children, [renderer.canvas])

        const beforeNoop = renderer.canvas
        await renderer.switchBackend('glsl')
        assert.equal(renderer.canvas, beforeNoop, 'a switch to the active backend keeps the canvas')
    })
}

test('dispose with resetCanvas and no canvasContainer keeps the host canvas', async () => {
    // Hosts without a canvasContainer reuse their canvas element for the next
    // renderer, so dispose() must not detach it.
    const { renderer, parent, canvas } = rendererOnCanvas({ withContainer: false })

    await renderer.dispose({ loseContext: true, resetCanvas: true })

    assert.equal(renderer.canvas, canvas)
    assert.deepEqual(parent.children, [canvas])
})

test('successful fallback recreation installs a fresh pipeline then disposes the terminal old pipeline', async () => {
    const events = []
    const previousPipeline = {
        width: 16,
        height: 16,
        graph: { id: 'old graph' },
        isCompiling: false,
        createSurfaces() {
            throw new Error('force full recreation')
        },
        dispose() {
            events.push('old pipeline dispose')
        }
    }
    const replacement = { backend: {}, setMidiState() {}, setAudioState() {} }
    const renderer = bareRenderer(previousPipeline)
    renderer._currentDsl = ''
    renderer._createRuntime = async (dsl, options) => {
        assert.equal(dsl, 'search synth\nrender(o0)')
        assert.equal(options.canvas, undefined)
        events.push('replacement created')
        return replacement
    }

    const originalError = console.error
    console.error = () => {}
    try {
        const result = await renderer.compile('search synth\nrender(o0)')
        assert.equal(result, replacement)
    } finally {
        console.error = originalError
    }

    assert.equal(renderer.pipeline, replacement)
    assert.deepEqual(events, ['replacement created', 'old pipeline dispose'])
})

test('failed fallback recreation retains the active old pipeline without closing its sink', async () => {
    let disposals = 0
    const previousPipeline = {
        width: 16,
        height: 16,
        graph: { id: 'old graph' },
        isCompiling: false,
        createSurfaces() {
            throw new Error('force full recreation')
        },
        dispose() {
            disposals++
        }
    }
    const renderer = bareRenderer(previousPipeline)
    renderer._createRuntime = async () => {
        throw new Error('replacement failed')
    }

    const originalError = console.error
    console.error = () => {}
    try {
        await assert.rejects(
            renderer.compile('search synth\nrender(o0)'),
            { message: 'replacement failed' }
        )
    } finally {
        console.error = originalError
    }

    assert.equal(renderer.pipeline, previousPipeline)
    assert.equal(previousPipeline.isCompiling, false)
    assert.equal(disposals, 0)
})

test('context restoration disposes the dead pipeline in backendLost mode before rebuilding', async () => {
    const listeners = new Map()
    const canvas = {
        addEventListener(name, listener) { listeners.set(name, listener) },
        removeEventListener() {}
    }
    const events = []
    const oldPipeline = {
        backend: {},
        dispose(options) {
            events.push(['old pipeline dispose', options])
        }
    }
    const replacement = { backend: {} }
    const renderer = bareRenderer(oldPipeline)
    renderer._canvas = canvas
    renderer._currentDsl = 'search synth\nrender(o0)'
    renderer._onContextLost = null
    renderer._onContextRestored = null
    renderer._onError = null
    renderer.stop = () => {}
    renderer.start = () => {}
    renderer.compile = async () => {
        events.push(['compile replacement'])
        renderer._pipeline = replacement
        return replacement
    }
    renderer._reuploadCachedMeshes = async () => {}
    renderer._setupContextLossHandlers()

    const originalLog = console.log
    console.log = () => {}
    try {
        await listeners.get('webglcontextrestored')()
    } finally {
        console.log = originalLog
    }

    assert.deepEqual(events, [
        ['old pipeline dispose', { backendLost: true }],
        ['compile replacement']
    ])
    assert.equal(renderer.pipeline, replacement)
})

test('dispose during awaited initial creation invalidates and normally disposes the stale result', async () => {
    const creation = deferred()
    const events = []
    const renderer = bareRenderer()
    renderer._createRuntime = () => creation.promise
    const pending = renderer.compile('search synth\nrender(o0)')
    await flushMicrotasks()

    await renderer.dispose()
    creation.resolve(stalePipeline(events, 'stale'))

    assert.equal(await pending, null)
    assert.equal(renderer.pipeline, null)
    assert.deepEqual(events, [['stale dispose', {}]])
})

test('backend switch during awaited initial creation abandons the stale result without backend calls', async () => {
    const creation = deferred()
    const events = []
    const renderer = bareRenderer()
    renderer._createRuntime = () => creation.promise
    let resets = 0
    renderer.resetCanvas = () => { resets++ }
    const pending = renderer.compile('search synth\nrender(o0)')
    await flushMicrotasks()

    await renderer.switchBackend('wgsl')
    creation.resolve(stalePipeline(events, 'stale'))

    assert.equal(await pending, null)
    assert.equal(renderer.pipeline, null)
    assert.equal(resets, 1)
    assert.deepEqual(events, [['stale dispose', { backendLost: true }]])
})

function pendingFallbackFixture() {
    const creation = deferred()
    const events = []
    const previousPipeline = {
        width: 16,
        height: 16,
        graph: { id: 'old graph' },
        isCompiling: false,
        createSurfaces() { throw new Error('force full recreation') },
        dispose(options) { events.push(['old dispose', options]) }
    }
    const renderer = bareRenderer(previousPipeline)
    renderer._createRuntime = () => creation.promise
    return { renderer, creation, events }
}

test('dispose during awaited fallback creation retains no pipeline and disposes the stale result once', async () => {
    const fixture = pendingFallbackFixture()
    const originalError = console.error
    console.error = () => {}
    try {
        const pending = fixture.renderer.compile('search synth\nrender(o0)')
        await flushMicrotasks()
        await fixture.renderer.dispose()
        fixture.creation.resolve(stalePipeline(fixture.events, 'stale'))
        assert.equal(await pending, null)
    } finally {
        console.error = originalError
    }

    assert.equal(fixture.renderer.pipeline, null)
    assert.deepEqual(fixture.events, [
        ['old dispose', { loseContext: false }],
        ['stale dispose', {}]
    ])
})

test('backend switch during awaited fallback creation loss-safely disposes both old and stale pipelines', async () => {
    const fixture = pendingFallbackFixture()
    let resets = 0
    fixture.renderer.resetCanvas = () => { resets++ }
    const originalError = console.error
    console.error = () => {}
    try {
        const pending = fixture.renderer.compile('search synth\nrender(o0)')
        await flushMicrotasks()
        await fixture.renderer.switchBackend('wgsl')
        fixture.creation.resolve(stalePipeline(fixture.events, 'stale'))
        assert.equal(await pending, null)
    } finally {
        console.error = originalError
    }

    assert.equal(fixture.renderer.pipeline, null)
    assert.equal(resets, 1)
    assert.deepEqual(fixture.events, [
        ['old dispose', { loseContext: true }],
        ['stale dispose', { backendLost: true }]
    ])
})

function restorationFixture() {
    const listeners = new Map()
    const creation = deferred()
    const events = []
    const renderer = bareRenderer({
        backend: {},
        dispose(options) { events.push(['dead dispose', options]) }
    })
    renderer._canvas = {
        addEventListener(name, listener) { listeners.set(name, listener) },
        removeEventListener() {}
    }
    renderer._currentDsl = 'search synth\nrender(o0)'
    renderer._onContextLost = null
    renderer._onContextRestored = () => { events.push(['restored callback']) }
    renderer._onError = error => { events.push(['error', error]) }
    renderer.stop = () => { renderer._isRunning = false }
    renderer.start = () => {
        if (!renderer._isRunning) {
            renderer._isRunning = true
            events.push(['start'])
        }
    }
    renderer._wasRunningBeforeContextLoss = true
    renderer._createRuntime = () => creation.promise
    renderer._reuploadCachedMeshes = async () => {}
    renderer._setupContextLossHandlers()
    return { renderer, listeners, creation, events }
}

test('dispose during restoration cancels stale completion without an error or render-loop resurrection', async () => {
    const fixture = restorationFixture()
    const originalLog = console.log
    console.log = () => {}
    try {
        const restoring = fixture.listeners.get('webglcontextrestored')()
        await flushMicrotasks()
        await fixture.renderer.dispose()
        fixture.creation.resolve(stalePipeline(fixture.events, 'stale'))
        await restoring
    } finally {
        console.log = originalLog
    }

    assert.equal(fixture.renderer.pipeline, null)
    assert.equal(fixture.renderer._isRunning, false)
    assert.deepEqual(fixture.events, [
        ['dead dispose', { backendLost: true }],
        ['stale dispose', {}]
    ])
})

test('backend switch during restoration loss-safely cancels the stale result without resurrection', async () => {
    const fixture = restorationFixture()
    let resets = 0
    fixture.renderer.resetCanvas = () => { resets++ }
    const originalLog = console.log
    console.log = () => {}
    try {
        const restoring = fixture.listeners.get('webglcontextrestored')()
        await flushMicrotasks()
        await fixture.renderer.switchBackend('wgsl')
        fixture.creation.resolve(stalePipeline(fixture.events, 'stale'))
        await restoring
    } finally {
        console.log = originalLog
    }

    assert.equal(fixture.renderer.pipeline, null)
    assert.equal(fixture.renderer._isRunning, false)
    assert.equal(resets, 1)
    assert.deepEqual(fixture.events, [
        ['dead dispose', { backendLost: true }],
        ['stale dispose', { backendLost: true }]
    ])
})

test('overlapping initial compiles share one canvas initialization and apply in order', async () => {
    const renderer = bareRenderer()
    const creation = deferred()
    let creations = 0
    renderer._createRuntime = () => { creations++; return creation.promise }
    const first = renderer.compile('search synth\nrender(o0)')
    const second = renderer.compile('search synth\nrender(o1)')
    await flushMicrotasks()
    assert.equal(creations, 1, 'two initializations must not reconfigure the same canvas concurrently')
    const pipeline = {
        ...stalePipeline([], 'initial'), width: 16, height: 16,
        createSurfaces() {}, collectDefaultUniforms() { return {} },
        recreateTextures() {}, initAsyncEffects() {}, async compilePrograms() {}
    }
    creation.resolve(pipeline)
    assert.equal(await first, pipeline)
    assert.equal(await second, pipeline)
    assert.equal(creations, 1)
    assert.equal(renderer.pipeline.graph.renderSurface, 'o1')
    assert.equal(renderer.currentDsl, 'search synth\nrender(o1)')
})

test('a failed compile does not block the next queued compile', async () => {
    const renderer = bareRenderer()
    const creation = deferred()
    const pipeline = stalePipeline([], 'recovered')
    let creations = 0
    renderer._createRuntime = () => ++creations === 1 ? creation.promise : Promise.resolve(pipeline)
    const first = renderer.compile('search synth\nrender(o0)')
    const second = renderer.compile('search synth\nrender(o1)')
    const settled = Promise.allSettled([first, second])
    creation.reject(new Error('initial compile failed'))
    const results = await settled
    assert.equal(results[0].status, 'rejected')
    assert.equal(results[1].status, 'fulfilled')
    assert.equal(results[1].value, pipeline)
    assert.equal(renderer.pipeline, pipeline)
})

const ACCEPTED_DSL = 'search synth\nrender(o0)'
const REJECTED_DSL = 'search synth\nnoise(notAParam: 1).write(o0)\nrender(o0)'

function rejectedCompileError() {
    return {
        code: 'ERR_COMPILATION_FAILED',
        diagnostics: [{ code: 'S001', severity: 'error', message: "Unknown argument 'notAParam' for noise()" }]
    }
}

function retainedStubPipeline(events, name) {
    return {
        backend: {},
        width: 16,
        height: 16,
        graph: { id: name },
        isCompiling: false,
        setMidiState() {},
        setAudioState() {},
        // Forces recompile() to return null, so _compile() takes the full
        // recreation path, as it does when compileGraph() rejects the source.
        createSurfaces() { throw new Error('force full recreation') },
        dispose(options) { events.push([`${name} dispose`, options]) }
    }
}

async function withSilencedConsole(fn) {
    const saved = { error: console.error, warn: console.warn, log: console.log }
    console.error = () => {}
    console.warn = () => {}
    console.log = () => {}
    try {
        return await fn()
    } finally {
        Object.assign(console, saved)
    }
}

test('a rejected recompile keeps currentDsl on the source of the retained pipeline', async () => {
    const events = []
    const accepted = retainedStubPipeline(events, 'accepted')
    const renderer = bareRenderer()
    renderer._currentDsl = ''
    const created = []
    renderer._createRuntime = async (dsl) => {
        created.push(dsl)
        if (dsl === REJECTED_DSL) throw rejectedCompileError()
        return accepted
    }

    assert.equal(await renderer.compile(ACCEPTED_DSL), accepted)
    assert.equal(renderer.currentDsl, ACCEPTED_DSL)

    await withSilencedConsole(() => assert.rejects(
        renderer.compile(REJECTED_DSL),
        (err) => err.code === 'ERR_COMPILATION_FAILED'
    ))

    assert.deepEqual(created, [ACCEPTED_DSL])
    assert.equal(renderer.pipeline, accepted, 'the rejected compile keeps the previous pipeline')
    assert.equal(renderer.currentDsl, ACCEPTED_DSL, 'currentDsl names the source of the retained pipeline')
    assert.deepEqual(events, [], 'the retained pipeline is not disposed')
})

test('a rejected first compile keeps the previous currentDsl', async () => {
    const renderer = bareRenderer()
    renderer._currentDsl = ACCEPTED_DSL
    renderer._createRuntime = async () => { throw rejectedCompileError() }

    await assert.rejects(renderer.compile(REJECTED_DSL), (err) => err.code === 'ERR_COMPILATION_FAILED')

    assert.equal(renderer.pipeline, null)
    assert.equal(renderer.currentDsl, ACCEPTED_DSL)
})

test('context restore after a rejected compile rebuilds the last accepted source', async () => {
    const events = []
    const accepted = retainedStubPipeline(events, 'accepted')
    const restored = retainedStubPipeline(events, 'restored')
    const listeners = new Map()
    const renderer = bareRenderer()
    renderer._canvas = {
        addEventListener(name, listener) { listeners.set(name, listener) },
        removeEventListener() {}
    }
    renderer._currentDsl = ''
    renderer._onContextLost = null
    renderer._onContextRestored = () => { events.push(['restored callback']) }
    renderer._onError = (error) => { events.push(['error', error.code]) }
    renderer.stop = () => { renderer._isRunning = false }
    renderer.start = () => { renderer._isRunning = true }
    renderer._setupContextLossHandlers()

    const created = []
    renderer._createRuntime = async (dsl) => {
        created.push(dsl)
        if (dsl === REJECTED_DSL) throw rejectedCompileError()
        return created.length === 1 ? accepted : restored
    }

    await renderer.compile(ACCEPTED_DSL)
    renderer.start()
    await withSilencedConsole(async () => {
        await assert.rejects(renderer.compile(REJECTED_DSL), (err) => err.code === 'ERR_COMPILATION_FAILED')
        listeners.get('webglcontextlost')({ preventDefault() {} })
        await listeners.get('webglcontextrestored')()
    })

    assert.deepEqual(created, [ACCEPTED_DSL, ACCEPTED_DSL])
    assert.equal(renderer.pipeline, restored)
    assert.equal(renderer.currentDsl, ACCEPTED_DSL)
    assert.equal(renderer._isRunning, true, 'the render loop resumes after the restore')
    assert.deepEqual(events, [
        ['accepted dispose', { backendLost: true }],
        ['restored callback']
    ], 'the restore reports no error')
})

test('disposal invalidates queued compiles before they can configure a canvas', async () => {
    const renderer = bareRenderer()
    const creation = deferred()
    let creations = 0
    renderer._createRuntime = () => { creations++; return creation.promise }
    const first = renderer.compile('search synth\nrender(o0)')
    const second = renderer.compile('search synth\nrender(o1)')
    await renderer.dispose()
    creation.resolve(stalePipeline([], 'stale'))
    assert.deepEqual(await Promise.all([first, second]), [null, null])
    assert.equal(creations, 1)
    assert.equal(renderer.pipeline, null)
})

test('render loop skips the draw while a sink defers and resumes afterward', () => {
    let deferNext = true
    const renders = []
    const pipeline = {
        shouldDeferRender: () => deferNext,
        render: (time) => renders.push(time),
        lastPassCount: 1
    }
    const renderer = bareRenderer(pipeline)
    Object.assign(renderer, {
        _isRunning: true, _deferredFrameCount: 0, _loopStartTime: 0, _loopDuration: 10,
        _frameTimeBuffer: new Float64Array(4), _frameTimeIndex: 0, _frameTimeCount: 0,
        _frameTimeBufferSize: 4, _fpsFrameCount: 0, _fpsLastUpdateTime: 0, _boundRenderLoop: () => {}
    })
    const previousRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = () => 1
    try {
        renderer._renderLoop(16)
        assert.equal(renders.length, 0)
        assert.equal(renderer.deferredFrameCount, 1)
        assert.equal(renderer.frameCount, 0)
        deferNext = false
        renderer._renderLoop(33)
        assert.equal(renders.length, 1)
        assert.equal(renderer.deferredFrameCount, 1)
        assert.equal(renderer.frameCount, 1)
    } finally {
        globalThis.requestAnimationFrame = previousRaf
    }
})

test('constructor sizes an unsized canvas element from the render options', async () => {
    const canvas = new FakeCanvasElement()
    new CanvasRenderer({ canvas, width: 640, height: 360 })
    await flushMicrotasks()
    assert.equal(canvas.width, 640)
    assert.equal(canvas.height, 360)
    assert.equal(canvas.getAttribute('width'), '640')
    assert.equal(canvas.getAttribute('height'), '360')
})

test('constructor applies the default render size to an unsized canvas element', async () => {
    const canvas = new FakeCanvasElement()
    new CanvasRenderer({ canvas })
    await flushMicrotasks()
    assert.equal(canvas.width, 1024)
    assert.equal(canvas.height, 1024)
})

test('constructor keeps a canvas element sized by attribute and reports the disagreement', async () => {
    const canvas = new FakeCanvasElement()
    canvas.setAttribute('width', '320')
    canvas.setAttribute('height', '240')
    const warnings = captureWarnings(() => {
        new CanvasRenderer({ canvas, width: 640, height: 360 })
    })
    await flushMicrotasks()
    assert.equal(canvas.width, 320)
    assert.equal(canvas.height, 240)
    assert.equal(warnings.length, 1)
    assert.ok(warnings[0].includes('320x240'), `diagnostic names the canvas size: ${warnings[0]}`)
    assert.ok(warnings[0].includes('640x360'), `diagnostic names the option size: ${warnings[0]}`)
})

test('constructor keeps a canvas element sized by property before construction', async () => {
    const canvas = new FakeCanvasElement()
    canvas.width = 320
    canvas.height = 240
    const warnings = captureWarnings(() => {
        new CanvasRenderer({ canvas, width: 640, height: 360 })
    })
    await flushMicrotasks()
    assert.equal(canvas.width, 320)
    assert.equal(canvas.height, 240)
    assert.equal(warnings.length, 1)
})

test('constructor stays silent when the host-sized canvas matches the options', () => {
    const canvas = new FakeCanvasElement()
    canvas.setAttribute('width', '640')
    canvas.setAttribute('height', '360')
    const warnings = captureWarnings(() => {
        new CanvasRenderer({ canvas, width: 640, height: 360 })
    })
    assert.equal(canvas.width, 640)
    assert.equal(canvas.height, 360)
    assert.equal(warnings.length, 0)
})

const SHADERS_URL = new URL('../', import.meta.url).href.replace(/\/$/, '')

/** Run fn with globalThis.fetch replaced, then put the original back. */
async function withFetch(fetchImpl, fn) {
    const previousFetch = globalThis.fetch
    globalThis.fetch = fetchImpl
    try {
        return await fn()
    } finally {
        globalThis.fetch = previousFetch
    }
}

/** fetch() that serves file: URLs from disk and answers 404 for a missing file. */
async function fileFetch(url) {
    const filePath = fileURLToPath(url)
    if (!fs.existsSync(filePath)) return { ok: false, status: 404 }
    const text = fs.readFileSync(filePath, 'utf8')
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) }
}

test('loadManifest rejects with the manifest URL and the HTTP status when the response is not OK', async () => {
    const requested = []
    const renderer = new CanvasRenderer({ basePath: '/no-such-dir' })
    await withFetch(async (url) => { requested.push(url); return { ok: false, status: 404 } }, async () => {
        await assert.rejects(renderer.loadManifest(),
            { message: 'Could not load shader manifest /no-such-dir/effects/manifest.json: HTTP 404' })
    })
    assert.deepEqual(requested, ['/no-such-dir/effects/manifest.json'])
    assert.deepEqual(renderer.manifest, {}, 'a failed load keeps no manifest entries')
})

test('loadManifest rejects with the fetch error when the request itself fails', async () => {
    const networkError = new TypeError('Failed to fetch')
    const renderer = new CanvasRenderer({ basePath: 'https://cdn.invalid/shaders' })
    await withFetch(async () => { throw networkError }, async () => {
        await assert.rejects(renderer.loadManifest(), (err) => {
            assert.equal(err.message, 'Could not load shader manifest https://cdn.invalid/shaders/effects/manifest.json: Failed to fetch')
            assert.equal(err.cause, networkError)
            return true
        })
    })
})

test('loadManifest rejects when the manifest is not JSON', async () => {
    const renderer = new CanvasRenderer({ basePath: '/shaders' })
    const response = { ok: true, status: 200, json: async () => JSON.parse('<!doctype html>') }
    await withFetch(async () => response, async () => {
        await assert.rejects(renderer.loadManifest(),
            (err) => err.message.startsWith('Could not read shader manifest /shaders/effects/manifest.json: ') &&
                err.cause instanceof SyntaxError)
    })
})

test('loadEffects attempts every effect and lists each failed effect ID with its load error in failed', async () => {
    const events = []
    const renderer = new CanvasRenderer({
        basePath: SHADERS_URL,
        onLoadingStart: (ids) => events.push(['start', ids]),
        onLoadingEnd: () => events.push(['end'])
    })
    const effects = await withFetch(fileFetch, async () => {
        await renderer.loadManifest()
        return withSilencedConsole(() =>
            renderer.loadEffects(['synth/noise', 'synth/noSuchEffect', 'filter/noSuchFilter']))
    })
    assert.deepEqual(effects.map((effect) => `${effect.namespace}/${effect.name}`), ['synth/noise'])
    assert.deepEqual(effects.failed.map((entry) => entry.effectId), ['synth/noSuchEffect', 'filter/noSuchFilter'])
    for (const entry of effects.failed) {
        assert.ok(entry.error instanceof Error, `${entry.effectId}: the load error is kept`)
    }
    assert.deepEqual(events, [['start', ['synth/noise', 'synth/noSuchEffect', 'filter/noSuchFilter']], ['end']],
        'onLoadingEnd runs once after the failure')
    assert.ok(renderer.loadedEffects.has('synth/noise'), 'the effect that loaded stays loaded')
})

test('loadEffects lists a single failed effect', async () => {
    const renderer = new CanvasRenderer({ basePath: SHADERS_URL })
    const effects = await withFetch(fileFetch, async () => {
        await renderer.loadManifest()
        return withSilencedConsole(() => renderer.loadEffects(['synth/noSuchEffect']))
    })
    assert.equal(effects.length, 0)
    assert.equal(effects.failed.length, 1)
    assert.equal(effects.failed[0].effectId, 'synth/noSuchEffect')
    assert.ok(effects.failed[0].error instanceof Error)
})

test('loadEffects never rejects for a failed effect', async () => {
    const renderer = new CanvasRenderer({ basePath: '/no-such-dir' })
    renderer._manifest = { 'synth/noise': {}, 'filter/bloom': {} }
    await withSilencedConsole(() => assert.doesNotReject(async () => {
        const effects = await renderer.loadEffects(['synth/noise', 'filter/bloom', 'not-an-id'])
        assert.equal(effects.length, 0)
        assert.deepEqual(effects.failed.map((entry) => entry.effectId), ['synth/noise', 'filter/bloom', 'not-an-id'])
    }))
})

test('loadEffects resolves with the loaded effects, an empty failed list, and one onLoadingEnd when every load succeeds', async () => {
    let ends = 0
    const renderer = new CanvasRenderer({ basePath: SHADERS_URL, onLoadingEnd: () => { ends++ } })
    const effects = await withFetch(fileFetch, async () => {
        await renderer.loadManifest()
        return renderer.loadEffects(['synth/noise', 'filter/bloom'])
    })
    assert.deepEqual(effects.map((effect) => `${effect.namespace}/${effect.name}`), ['synth/noise', 'filter/bloom'])
    assert.deepEqual(effects.failed, [])
    assert.equal(ends, 1)
    assert.deepEqual((await renderer.loadEffects(['synth/noise'])).failed, [], 'a cached load lists no failures')
    assert.deepEqual((await renderer.loadEffects([])).failed, [], 'an empty request lists no failures')
})

for (const { name, fn } of tests) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error)
        process.exit(1)
    }
}

console.log(`\n${tests.length}/${tests.length} CanvasRenderer sink API tests passed`)
