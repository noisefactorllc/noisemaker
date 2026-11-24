// The WebGL2 Display P3 canvas: how the drawing buffer is set for each color
// output, the fallback, the reconfiguration after a display change, the
// canvas copy of the display-p3 path, and its release. Each browser behavior
// is a stub.
import assert from 'node:assert/strict'
import test from 'node:test'
import { DISPLAY_P3, SRGB, configureWebGL2Canvas, restoreWebGL2Canvas } from '../src/runtime/color-output.js'
import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'
import { Pipeline, createPipeline } from '../src/runtime/pipeline.js'

const RGBA8 = 0x8058
const RGBA16F = 0x881A
const FLOAT = 0x1406
const RGBA = 0x1908

// A display whose gamut query can change, as matchMedia's change event reports.
function display(p3) {
    const listeners = new Set()
    const query = {
        media: '(color-gamut: p3)',
        matches: p3,
        addEventListener: (type, listener) => { if (type === 'change') listeners.add(listener) },
        removeEventListener: (type, listener) => { if (type === 'change') listeners.delete(listener) },
    }
    return {
        listeners,
        matchMedia: media => media === '(color-gamut: p3)' ? query : { media, matches: false },
        change(next) {
            query.matches = next
            for (const listener of [...listeners]) listener({ matches: next, media: query.media })
        },
    }
}

// A WebGL2 context. `browser` is one of:
// - 'supports': drawingBufferColorSpace, drawingBufferStorage and EXT_color_buffer_float;
// - 'no-storage': drawingBufferColorSpace only;
// - 'no-float': no EXT_color_buffer_float, so drawingBufferStorage refuses RGBA16F;
// - 'refuses-16f': the extension, but drawingBufferStorage keeps the format it had;
// - 'no-color-space': none of them.
function context(browser = 'supports', { width = 4, height = 2 } = {}) {
    const calls = []
    let space = SRGB
    let format = RGBA8
    let floatEnabled = false
    let error = 0
    const pixels = new Float32Array(width * height * 4).map((_, index) => index)
    const gl = {
        calls,
        RGBA8, RGBA16F, FLOAT, RGBA, FRAMEBUFFER: 0x8D40,
        drawingBufferWidth: width,
        drawingBufferHeight: height,
        getExtension(name) {
            calls.push(['getExtension', name])
            if (name === 'EXT_color_buffer_float' && browser !== 'no-float') { floatEnabled = true; return {} }
            return null
        },
        NO_ERROR: 0,
        lost: false,
        isContextLost() { return gl.lost },
        getError() { const value = error; error = 0; return value },
        bindFramebuffer(target, framebuffer) { calls.push(['bindFramebuffer', framebuffer]) },
        clearColor() {},
        // As WebGL does, a read that does not match the buffer records INVALID_OPERATION and leaves the output as it is.
        readPixels(x, y, w, h, readFormat, type, out) {
            calls.push(['readPixels', readFormat, type])
            if (type !== FLOAT || format !== RGBA16F) { error = 0x0502; return }
            out.set(pixels.subarray(0, w * h * 4))
        },
        pixels,
    }
    if (browser !== 'no-color-space') {
        Object.defineProperty(gl, 'drawingBufferColorSpace', {
            get: () => space,
            set: value => { calls.push(['drawingBufferColorSpace', value]); if (value === SRGB || value === DISPLAY_P3) space = value },
            enumerable: true,
        })
        Object.defineProperty(gl, 'drawingBufferFormat', { get: () => format, enumerable: true, configurable: true })
    }
    if (browser === 'supports' || browser === 'no-float' || browser === 'refuses-16f') {
        gl.drawingBufferStorage = (sizedFormat, w, h) => {
            calls.push(['drawingBufferStorage', sizedFormat, w, h])
            if (sizedFormat === RGBA16F && (!floatEnabled || browser === 'refuses-16f')) return // INVALID_ENUM: the format is unchanged
            format = sizedFormat
        }
    }
    return gl
}

test('srgb leaves the drawing buffer as it is, untouched', () => {
    const gl = context()
    assert.equal(configureWebGL2Canvas(gl, { requested: SRGB, env: display(true) }), SRGB)
    assert.equal(configureWebGL2Canvas(gl, { env: display(true) }), SRGB, 'srgb is the default')
    assert.deepEqual(gl.calls, [], 'no property is set, no storage is made and no extension is enabled')
})

test('display-p3 sets Display P3 in a 16-bit float drawing buffer of the same size', () => {
    const gl = context('supports')
    assert.equal(configureWebGL2Canvas(gl, { requested: DISPLAY_P3, env: display(true) }), DISPLAY_P3)
    assert.equal(gl.drawingBufferColorSpace, DISPLAY_P3)
    assert.equal(gl.drawingBufferFormat, RGBA16F)
    assert.deepEqual(gl.calls.find(call => call[0] === 'drawingBufferStorage'), ['drawingBufferStorage', RGBA16F, 4, 2])
})

test('without a 16-bit drawing buffer, display-p3 falls back to srgb in the 8-bit buffer', () => {
    for (const browser of ['no-storage', 'no-float', 'refuses-16f']) {
        const gl = context(browser)
        assert.equal(configureWebGL2Canvas(gl, { requested: DISPLAY_P3, env: display(true) }), SRGB, browser)
        assert.equal(gl.drawingBufferColorSpace, SRGB, `${browser}: the color space is srgb again`)
        assert.equal(gl.drawingBufferFormat, RGBA8, `${browser}: the buffer stays 8-bit`)
    }
})

test('without drawingBufferColorSpace, or on an sRGB display, display-p3 touches nothing', () => {
    const noSpace = context('no-color-space')
    assert.equal(configureWebGL2Canvas(noSpace, { requested: DISPLAY_P3, env: display(true) }), SRGB)
    assert.equal('drawingBufferColorSpace' in noSpace, false, 'no plain property is created')
    assert.deepEqual(noSpace.calls, [])
    const srgbDisplay = context('supports')
    assert.equal(configureWebGL2Canvas(srgbDisplay, { requested: DISPLAY_P3, env: display(false) }), SRGB)
    assert.deepEqual(srgbDisplay.calls, [])
    assert.equal(configureWebGL2Canvas(context('supports'), { requested: DISPLAY_P3, env: {} }), SRGB, 'no matchMedia')
})

test('a context that is still Display P3 from an earlier pipeline is put back to srgb when the next request gives srgb', () => {
    for (const [requested, p3] of [[SRGB, true], [DISPLAY_P3, false]]) {
        const gl = context('supports')
        assert.equal(configureWebGL2Canvas(gl, { requested: DISPLAY_P3, env: display(true) }), DISPLAY_P3)
        assert.equal(configureWebGL2Canvas(gl, { requested, env: display(p3) }), SRGB)
        assert.equal(gl.drawingBufferColorSpace, SRGB, `${requested} on a ${p3 ? 'P3' : 'sRGB'} display`)
        assert.equal(gl.drawingBufferFormat, RGBA8)
    }
})

test('a context that is already a Display P3 16-bit buffer is not made again', () => {
    const gl = context('supports')
    configureWebGL2Canvas(gl, { requested: DISPLAY_P3, env: display(true) })
    const before = gl.calls.filter(call => call[0] === 'drawingBufferStorage').length
    assert.equal(configureWebGL2Canvas(gl, { requested: DISPLAY_P3, env: display(true) }), DISPLAY_P3)
    assert.equal(gl.calls.filter(call => call[0] === 'drawingBufferStorage').length, before, 'drawingBufferStorage would clear the kept frame')
})

test('restoring a Display P3 canvas gives srgb in an 8-bit buffer', () => {
    const gl = context('supports')
    configureWebGL2Canvas(gl, { requested: DISPLAY_P3, env: display(true) })
    restoreWebGL2Canvas(gl)
    assert.equal(gl.drawingBufferColorSpace, SRGB)
    assert.equal(gl.drawingBufferFormat, RGBA8)
    const untouched = context('supports')
    restoreWebGL2Canvas(untouched)
    assert.deepEqual(untouched.calls.filter(call => call[0] === 'drawingBufferStorage'), [], 'an 8-bit buffer is not made again')
})

function backendFor(browser, { requested = DISPLAY_P3, p3 = true } = {}) {
    const gl = context(browser)
    const env = display(p3)
    const colorOutput = configureWebGL2Canvas(gl, { requested, env })
    const backend = new WebGL2Backend(gl, { width: 4, height: 2 }, { colorOutput, colorRequest: { requested, env } })
    return { backend, gl, env }
}

test('the backend reports the color output it was given', () => {
    assert.equal(backendFor('supports').backend.colorOutput, DISPLAY_P3)
    assert.equal(backendFor('no-storage').backend.colorOutput, SRGB)
    assert.equal(new WebGL2Backend(context(), null).colorOutput, SRGB, 'without options, srgb')
})

test('a display change sets the drawing buffer again at the next frame', () => {
    const { backend, gl, env } = backendFor('supports')
    assert.equal(env.listeners.size, 1, 'the backend follows the display')
    env.change(false)
    assert.equal(backend.colorOutput, DISPLAY_P3, 'nothing changes before the next frame')
    assert.equal(gl.drawingBufferFormat, RGBA16F)
    backend.beginFrame()
    assert.equal(backend.colorOutput, SRGB)
    assert.equal(gl.drawingBufferColorSpace, SRGB)
    assert.equal(gl.drawingBufferFormat, RGBA8)
    env.change(true)
    backend.beginFrame()
    assert.equal(backend.colorOutput, DISPLAY_P3)
    assert.equal(gl.drawingBufferColorSpace, DISPLAY_P3)
    assert.equal(gl.drawingBufferFormat, RGBA16F)
    const storageCalls = gl.calls.filter(call => call[0] === 'drawingBufferStorage').length
    backend.beginFrame()
    assert.equal(gl.calls.filter(call => call[0] === 'drawingBufferStorage').length, storageCalls, 'a frame with no change sets nothing')
})

test('an srgb request does not follow the display', () => {
    const { backend, env } = backendFor('supports', { requested: SRGB })
    assert.equal(env.listeners.size, 0)
    assert.equal(backend.colorOutput, SRGB)
})

test('on the display-p3 path, the canvas copy reads the drawing buffer as floats, top row first', async () => {
    const { backend, gl } = backendFor('supports')
    const frame = await backend.readCanvasCopy()
    assert.deepEqual([frame.width, frame.height, frame.format, frame.bytesPerPixel], [4, 2, 'rgba32float', 16])
    assert.deepEqual(gl.calls.find(call => call[0] === 'readPixels'), ['readPixels', RGBA, FLOAT])
    assert.deepEqual(gl.calls.find(call => call[0] === 'bindFramebuffer'), ['bindFramebuffer', null], 'it reads the default framebuffer')
    const floats = new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4)
    assert.equal(floats.length, 4 * 2 * 4)
    // readPixels gives the bottom row first; the copy gives the top row first.
    assert.deepEqual(Array.from(floats.subarray(0, 4)), Array.from(gl.pixels.subarray(16, 20)))
    assert.deepEqual(Array.from(floats.subarray(16, 20)), Array.from(gl.pixels.subarray(0, 4)))
})

test('a canvas copy refuses a lost context and a failed read instead of returning zeros', async () => {
    const lost = backendFor('supports')
    lost.gl.lost = true
    await assert.rejects(lost.backend.readCanvasCopy(), /context is lost/)
    const failed = backendFor('supports')
    restoreWebGL2Canvas(failed.gl)
    await assert.rejects(failed.backend.readCanvasCopy(), /GL error/)
    const lostDuringRead = backendFor('supports')
    const read = lostDuringRead.gl.readPixels
    lostDuringRead.gl.readPixels = (...args) => { lostDuringRead.gl.lost = true; read(...args) }
    await assert.rejects(lostDuringRead.backend.readCanvasCopy(), /context is lost/)
})

test('an error flag left by earlier work does not refuse a good canvas copy', async () => {
    const { backend, gl } = backendFor('supports')
    let stale = 0x0500
    const getError = gl.getError
    gl.getError = () => { if (stale) { const value = stale; stale = 0; return value } return getError() }
    const frame = await backend.readCanvasCopy()
    assert.equal(frame.format, 'rgba32float')
})

test('a context that a host made with another 8-bit format is not given a new drawing buffer', () => {
    const gl = context('supports')
    Object.defineProperty(gl, 'drawingBufferFormat', { get: () => 0x8051, configurable: true }) // RGB8, an alpha: false context
    assert.equal(configureWebGL2Canvas(gl, { requested: SRGB, env: display(true) }), SRGB)
    assert.deepEqual(gl.calls, [])
})

test('the srgb path has no canvas copy', async () => {
    const { backend, gl } = backendFor('no-storage')
    await assert.rejects(backend.readCanvasCopy(), /display-p3/)
    assert.equal(gl.calls.some(call => call[0] === 'readPixels'), false)
})

test('destroy(), and a pipeline disposed after its context was lost, stop following the display', async () => {
    const destroyed = backendFor('supports')
    assert.equal(destroyed.env.listeners.size, 1)
    destroyed.backend.destroy()
    assert.equal(destroyed.env.listeners.size, 0)
    const lost = backendFor('supports')
    assert.equal(lost.env.listeners.size, 1)
    const pipeline = Object.assign(Object.create(Pipeline.prototype), {
        _asyncRenders: new Map(),
        sinkManager: { close() {} },
        surfaces: new Map(),
        backend: lost.backend,
    })
    pipeline.dispose({ backendLost: true })
    assert.equal(lost.env.listeners.size, 0)
    await assert.rejects(lost.backend.readCanvasCopy(), /released/)
})

test('a destroy() that fails part way has already removed the display listener', () => {
    const { backend, env } = backendFor('supports')
    assert.equal(env.listeners.size, 1)
    backend.textures.set('broken', { handle: {}, width: 1, height: 1 })
    assert.throws(() => backend.destroy())
    assert.equal(env.listeners.size, 0)
})

test('a WebGL2 pipeline whose initialization fails leaves no display listener behind', async () => {
    const env = display(true)
    const gl = context('supports')
    const saved = { matchMedia: globalThis.matchMedia, init: Pipeline.prototype.init }
    globalThis.matchMedia = env.matchMedia
    let followed = null
    Pipeline.prototype.init = async () => {
        followed = env.listeners.size
        throw new Error('the first compile failed')
    }
    try {
        await assert.rejects(createPipeline({}, { canvas: { getContext: () => gl, width: 4, height: 2 }, colorOutput: DISPLAY_P3 }), /the first compile failed/)
        assert.equal(followed, 1, 'the backend followed the display while it initialized')
        assert.equal(env.listeners.size, 0)
    } finally {
        if (saved.matchMedia === undefined) delete globalThis.matchMedia
        else globalThis.matchMedia = saved.matchMedia
        Pipeline.prototype.init = saved.init
    }
})

test('createPipeline sets the WebGL2 drawing buffer for display-p3, and the pipeline reports it', async () => {
    const env = display(true)
    const gl = context('supports')
    const saved = { matchMedia: globalThis.matchMedia, init: Pipeline.prototype.init }
    globalThis.matchMedia = env.matchMedia
    Pipeline.prototype.init = async () => {}
    try {
        const pipeline = await createPipeline({}, { canvas: { getContext: () => gl, width: 4, height: 2 }, colorOutput: DISPLAY_P3 })
        assert.equal(pipeline.colorOutput, DISPLAY_P3)
        assert.equal(gl.drawingBufferFormat, RGBA16F)
        assert.equal(env.listeners.size, 1)
        const plain = context('supports')
        const srgb = await createPipeline({}, { canvas: { getContext: () => plain, width: 4, height: 2 } })
        assert.equal(srgb.colorOutput, SRGB)
        assert.deepEqual(plain.calls, [], 'the default touches nothing in createPipeline')
    } finally {
        if (saved.matchMedia === undefined) delete globalThis.matchMedia
        else globalThis.matchMedia = saved.matchMedia
        Pipeline.prototype.init = saved.init
    }
})
