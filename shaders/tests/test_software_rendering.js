/**
 * Software rendering mode: detection and the CanvasRenderer single-frame mode.
 *
 * Auto mode must never turn on for a hardware GPU. A renderer string that
 * names a GPU wins over a failed failIfMajorPerformanceCaveat probe; the probe
 * decides only when the string is masked or missing.
 *
 * Run:  node shaders/tests/test_software_rendering.js
 */

import assert from 'node:assert/strict'
import { CanvasRenderer } from '../src/renderer/canvas.js'
import {
    classifySoftwareRendering,
    detectSoftwareRendering
} from '../src/renderer/software-rendering.js'
import * as engine from '../src/index.js'

const UNMASKED_RENDERER_WEBGL = 0x9246
const RENDERER = 0x1F01
const APPLE_M4 = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)'
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'

/** Canvases whose WebGL2 contexts report `renderer` and record every request. */
function fakeGpu({ renderer = APPLE_M4, caveatPasses = true, webgl2 = true, debugInfo = true } = {}) {
    const calls = { contexts: [], lost: 0 }
    const context = () => ({
        RENDERER,
        getExtension(name) {
            if (name === 'WEBGL_debug_renderer_info') return debugInfo ? { UNMASKED_RENDERER_WEBGL } : null
            if (name === 'WEBGL_lose_context') return { loseContext: () => { calls.lost++ } }
            return null
        },
        getParameter(parameter) {
            if (parameter === UNMASKED_RENDERER_WEBGL) return renderer
            if (parameter === RENDERER) return 'WebKit WebGL'
            return null
        }
    })
    const createCanvas = () => ({
        getContext(type, attributes) {
            calls.contexts.push({ type, attributes })
            if (type !== 'webgl2' || !webgl2) return null
            if (attributes?.failIfMajorPerformanceCaveat) return caveatPasses ? context() : null
            return context()
        }
    })
    return { createCanvas, calls }
}

/** Install fakeGpu canvases as the global OffscreenCanvas while fn runs. */
async function withOffscreenCanvas(gpu, fn) {
    const previous = globalThis.OffscreenCanvas
    globalThis.OffscreenCanvas = class { getContext(type, attributes) { return gpu.createCanvas().getContext(type, attributes) } }
    try {
        return await fn()
    } finally {
        if (previous === undefined) delete globalThis.OffscreenCanvas
        else globalThis.OffscreenCanvas = previous
    }
}

class FakeCanvasElement {
    constructor() { this._attributes = new Map(); this._width = 300; this._height = 150 }
    get width() { return this._width }
    set width(value) { this._width = Number(value) }
    get height() { return this._height }
    set height(value) { this._height = Number(value) }
    getAttribute(name) { return this._attributes.get(name) ?? null }
    setAttribute(name, value) {
        this._attributes.set(name, String(value))
        if (name === 'width') this._width = Number(value)
        if (name === 'height') this._height = Number(value)
    }
    addEventListener() {}
    removeEventListener() {}
    getContext() { return null }
}

// CanvasRenderer wraps HTMLCanvasElement's width and height accessors.
globalThis.HTMLCanvasElement = FakeCanvasElement

/** A pipeline stand-in that records each rendered time like Pipeline.render. */
function recordingPipeline() {
    const pipeline = {
        lastTime: 0,
        lastPassCount: 1,
        renders: [],
        render(time) { pipeline.lastTime = time; pipeline.renders.push(time) }
    }
    return pipeline
}

function rendererWith(options) {
    const canvas = new FakeCanvasElement()
    canvas.setAttribute('width', '640')
    canvas.setAttribute('height', '360')
    return new CanvasRenderer({ canvas, width: 640, height: 360, ...options })
}

function captureWarnings(fn) {
    const warnings = []
    const previous = console.warn
    console.warn = (...args) => warnings.push(args.join(' '))
    try { return { result: fn(), warnings } } finally { console.warn = previous }
}

const tests = []
const test = (name, fn) => tests.push({ name, fn })

// ---- Verdict --------------------------------------------------------------

test('a SwiftShader renderer string is software even when the caveat probe passes', () => {
    const verdict = classifySoftwareRendering({ webgl2: true, caveatPassed: true, renderer: SWIFTSHADER })
    assert.equal(verdict.software, true)
    assert.ok(verdict.reasons.some(reason => reason.includes('SwiftShader')), verdict.reasons.join('; '))
})

test('each known software rasterizer name is software', () => {
    for (const renderer of ['llvmpipe (LLVM 17.0.6, 256 bits)', 'softpipe', 'Microsoft Basic Render Driver', 'Apple Software Renderer']) {
        assert.equal(classifySoftwareRendering({ webgl2: true, caveatPassed: true, renderer }).software, true, renderer)
    }
})

test('a named hardware GPU is not software even when the caveat probe fails', () => {
    const verdict = classifySoftwareRendering({ webgl2: true, caveatPassed: false, renderer: APPLE_M4 })
    assert.equal(verdict.software, false)
    assert.equal(verdict.caveatProbe, 'failed')
    assert.ok(verdict.reasons.some(reason => reason.includes('Apple M4')), verdict.reasons.join('; '))
})

test('a masked renderer string defers to the caveat probe', () => {
    for (const renderer of [null, '', 'WebKit WebGL', 'Mozilla']) {
        assert.equal(classifySoftwareRendering({ webgl2: true, caveatPassed: false, renderer }).software, true, `failed probe, ${renderer}`)
        assert.equal(classifySoftwareRendering({ webgl2: true, caveatPassed: true, renderer }).software, false, `passed probe, ${renderer}`)
    }
})

test('no WebGL2 is reported as unavailable, never as software', () => {
    const verdict = classifySoftwareRendering({ webgl2: false, caveatPassed: false, renderer: null })
    assert.equal(verdict.software, false)
    assert.equal(verdict.webgl2, false)
})

test('the engine entry point exports the detection functions', () => {
    assert.equal(engine.detectSoftwareRendering, detectSoftwareRendering)
    assert.equal(engine.classifySoftwareRendering, classifySoftwareRendering)
})

// ---- Probe ----------------------------------------------------------------

test('detection probes its own canvases, reads the unmasked renderer and releases both contexts', () => {
    const gpu = fakeGpu({ renderer: SWIFTSHADER })
    const report = detectSoftwareRendering({ createCanvas: gpu.createCanvas })
    assert.equal(report.software, true)
    assert.equal(report.renderer, SWIFTSHADER)
    assert.equal(report.caveatProbe, 'passed')
    assert.deepEqual(gpu.calls.contexts.map(call => [call.type, Boolean(call.attributes?.failIfMajorPerformanceCaveat)]),
        [['webgl2', true], ['webgl2', false]])
    assert.equal(gpu.calls.lost, 2)
})

test('detection falls back to the plain RENDERER string without the debug extension', () => {
    const gpu = fakeGpu({ renderer: APPLE_M4, debugInfo: false, caveatPasses: false })
    const report = detectSoftwareRendering({ createCanvas: gpu.createCanvas })
    assert.equal(report.renderer, 'WebKit WebGL')
    assert.equal(report.software, true, 'masked string and failed probe')
})

test('detection without any canvas reports no WebGL2', () => {
    const report = detectSoftwareRendering({ createCanvas: () => null })
    assert.equal(report.software, false)
    assert.equal(report.webgl2, false)
})

// ---- CanvasRenderer mode --------------------------------------------------

test('softwareRendering defaults to off and runs no detection', async () => {
    const gpu = fakeGpu({ renderer: SWIFTSHADER })
    await withOffscreenCanvas(gpu, () => {
        const renderer = rendererWith({})
        assert.deepEqual(renderer.softwareRendering, { mode: 'off', active: false, report: null })
    })
    assert.equal(gpu.calls.contexts.length, 0)
})

test('auto mode turns on for a software renderer and stays off for a hardware GPU', async () => {
    await withOffscreenCanvas(fakeGpu({ renderer: SWIFTSHADER }), () => {
        const state = rendererWith({ softwareRendering: 'auto' }).softwareRendering
        assert.equal(state.mode, 'auto')
        assert.equal(state.active, true)
        assert.equal(state.report.renderer, SWIFTSHADER)
    })
    await withOffscreenCanvas(fakeGpu({ renderer: APPLE_M4, caveatPasses: false }), () => {
        const state = rendererWith({ softwareRendering: 'auto' }).softwareRendering
        assert.equal(state.active, false)
        assert.equal(state.report.software, false)
    })
})

test('on mode is active without running detection', async () => {
    const gpu = fakeGpu({ renderer: APPLE_M4 })
    await withOffscreenCanvas(gpu, () => {
        const state = rendererWith({ softwareRendering: 'on' }).softwareRendering
        assert.equal(state.mode, 'on')
        assert.equal(state.active, true)
        assert.equal(state.report.software, true)
    })
    assert.equal(gpu.calls.contexts.length, 0)
})

test('an unknown softwareRendering value falls back to off with a warning', () => {
    const { result: renderer, warnings } = captureWarnings(() => rendererWith({ softwareRendering: 'yes' }))
    assert.equal(renderer.softwareRendering.mode, 'off')
    assert.equal(renderer.softwareRendering.active, false)
    assert.ok(warnings.some(warning => warning.includes('softwareRendering')), warnings.join('\n'))
})

test('software mode keeps WebGL2: preferWebGPU is ignored and switchBackend(wgsl) is refused', async () => {
    const { result: renderer, warnings } = captureWarnings(() => rendererWith({ softwareRendering: 'on', preferWebGPU: true }))
    assert.equal(renderer.preferredBackend, 'glsl')
    assert.ok(warnings.some(warning => warning.includes('WebGPU')), warnings.join('\n'))
    const pipeline = recordingPipeline()
    renderer._pipeline = pipeline
    const switched = captureWarnings(() => renderer.switchBackend('wgsl'))
    await switched.result
    assert.equal(renderer.preferredBackend, 'glsl')
    assert.equal(renderer.pipeline, pipeline, 'the WebGL2 pipeline stays')
    assert.ok(switched.warnings.some(warning => warning.includes('WebGPU')), switched.warnings.join('\n'))
})

test('software mode start() renders one frame and does not start the animation loop', () => {
    const frames = []
    const renderer = rendererWith({ softwareRendering: 'on', onFrame: count => frames.push(count) })
    const pipeline = recordingPipeline()
    pipeline.lastTime = 0.25
    renderer._pipeline = pipeline
    const previousRaf = globalThis.requestAnimationFrame
    let rafCalls = 0
    globalThis.requestAnimationFrame = () => { rafCalls++; return 1 }
    try {
        renderer.start()
    } finally {
        globalThis.requestAnimationFrame = previousRaf
    }
    assert.equal(rafCalls, 0)
    assert.equal(renderer.isRunning, false)
    assert.deepEqual(pipeline.renders, [0.25])
    assert.deepEqual(frames, [1])
})

test('stepFrame advances one 60 fps frame of the loop and renders once', () => {
    const frames = []
    const renderer = rendererWith({ softwareRendering: 'on', onFrame: count => frames.push(count) })
    renderer.setLoopDuration(10)
    const pipeline = recordingPipeline()
    renderer._pipeline = pipeline
    const first = renderer.stepFrame()
    const second = renderer.stepFrame()
    assert.equal(first, 1 / 600)
    assert.equal(second, 2 / 600)
    assert.deepEqual(pipeline.renders, [1 / 600, 2 / 600])
    assert.equal(renderer.frameCount, 2)
    assert.deepEqual(frames, [1, 2])
})

test('stepFrame wraps at the end of the loop', () => {
    const renderer = rendererWith({ softwareRendering: 'on' })
    renderer.setLoopDuration(1)
    const pipeline = recordingPipeline()
    pipeline.lastTime = 59.5 / 60
    renderer._pipeline = pipeline
    const time = renderer.stepFrame()
    assert.ok(Math.abs(time - 0.5 / 60) < 1e-12, `wrapped time ${time}`)
})

test('stepFrame steps from a given time, for a host that holds its own paused time', () => {
    const renderer = rendererWith({})
    renderer.setLoopDuration(10)
    const pipeline = recordingPipeline()
    renderer._pipeline = pipeline
    assert.equal(renderer.stepFrame(0.5), 0.5 + 1 / 600)
    assert.deepEqual(pipeline.renders, [0.5 + 1 / 600])
})

test('stepFrame does nothing while the animation loop runs', () => {
    const renderer = rendererWith({})
    const pipeline = recordingPipeline()
    renderer._pipeline = pipeline
    renderer._isRunning = true
    const { result, warnings } = captureWarnings(() => renderer.stepFrame())
    assert.equal(result, null)
    assert.deepEqual(pipeline.renders, [])
    assert.ok(warnings.length === 1, warnings.join('\n'))
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

console.log(`\n${tests.length}/${tests.length} software rendering tests passed`)
