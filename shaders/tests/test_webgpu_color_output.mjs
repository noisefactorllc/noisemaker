// The WebGPU Display P3 canvas: how the canvas is configured for each color
// output, where the backend takes its canvas format from, the reconfiguration
// after a display change, and the canvas copy of the display-p3 path. Each
// browser behavior is a stub.
import assert from 'node:assert/strict'
import test from 'node:test'
import { DISPLAY_P3, P3_CANVAS_FORMAT, SRGB, configureWebGPUCanvas } from '../src/runtime/color-output.js'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'
import { Pipeline, createPipeline } from '../src/runtime/pipeline.js'

globalThis.GPUTextureUsage ??= { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10 }
globalThis.GPUBufferUsage ??= { MAP_READ: 0x01, COPY_DST: 0x08 }
globalThis.GPUMapMode ??= { READ: 0x01 }

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

// The browsers: one that supports the colorSpace member, one that drops it
// without an error as WebIDL does, and one without getConfiguration().
function context(browser = 'supports') {
    const configures = []
    let current = null
    const ctx = {
        configures,
        canvas: { width: 4, height: 2 },
        configure(configuration) {
            configures.push(configuration)
            const kept = { ...configuration }
            if (browser === 'drops') {
                delete kept.colorSpace
                delete kept.toneMapping
            }
            kept.colorSpace ??= SRGB
            current = kept
        },
        getCurrentTexture: () => ({ width: 4, height: 2, format: current?.format, createView: () => ({}) }),
    }
    if (browser !== 'no-getConfiguration') ctx.getConfiguration = () => current
    return ctx
}

const configuration = { device: {}, format: 'bgra8unorm', usage: 0x10 | 0x02, alphaMode: 'premultiplied' }

test('srgb configures the canvas exactly as before, once', () => {
    const ctx = context()
    assert.deepEqual(configureWebGPUCanvas(ctx, configuration, { requested: SRGB, env: display(true) }), { colorOutput: SRGB, configuration })
    assert.deepEqual(ctx.configures, [configuration])
    const defaulted = context()
    configureWebGPUCanvas(defaulted, configuration, { env: display(true) })
    assert.deepEqual(defaulted.configures, [configuration], 'srgb is the default')
})

test('display-p3 configures Display P3 with standard tone mapping, the 16-bit format and COPY_SRC', () => {
    const ctx = context('supports')
    const result = configureWebGPUCanvas(ctx, configuration, { requested: DISPLAY_P3, env: display(true) })
    const wide = { ...configuration, format: P3_CANVAS_FORMAT, usage: configuration.usage | 0x01, colorSpace: DISPLAY_P3, toneMapping: { mode: 'standard' } }
    assert.equal(result.colorOutput, DISPLAY_P3)
    assert.deepEqual(result.configuration, wide)
    assert.deepEqual(ctx.configures, [wide])
    assert.equal(P3_CANVAS_FORMAT, 'rgba16float')
})

test('a browser that drops colorSpace, or has no getConfiguration(), falls back to the srgb configuration as given', () => {
    for (const browser of ['drops', 'no-getConfiguration']) {
        const ctx = context(browser)
        const result = configureWebGPUCanvas(ctx, configuration, { requested: DISPLAY_P3, env: display(true) })
        assert.deepEqual(result, { colorOutput: SRGB, configuration }, browser)
        assert.deepEqual(ctx.configures.at(-1), configuration, `${browser}: the last configuration is the srgb one, exactly`)
    }
})

test('display-p3 on an sRGB display configures the canvas exactly as srgb does', () => {
    const ctx = context('supports')
    assert.deepEqual(configureWebGPUCanvas(ctx, configuration, { requested: DISPLAY_P3, env: display(false) }), { colorOutput: SRGB, configuration })
    assert.deepEqual(ctx.configures, [configuration])
    const noQuery = context('supports')
    assert.deepEqual(configureWebGPUCanvas(noQuery, configuration, { requested: DISPLAY_P3, env: {} }), { colorOutput: SRGB, configuration })
    assert.deepEqual(noQuery.configures, [configuration], 'without matchMedia, the canvas is configured exactly as srgb')
})

// A device that records what each submission holds.
function device() {
    const submissions = []
    const buffers = []
    return {
        submissions,
        buffers,
        queue: {
            submit: commandBuffers => submissions.push(commandBuffers.flatMap(buffer => buffer.commands)),
            writeBuffer() {},
            onSubmittedWorkDone: () => Promise.resolve(),
        },
        addEventListener() {},
        createCommandEncoder() {
            const commands = []
            return {
                beginRenderPass: () => {
                    commands.push('render')
                    return { setPipeline() {}, setBindGroup() {}, draw() { commands.push('draw') }, end() {} }
                },
                copyTextureToBuffer: (source, destination, size) => commands.push({ copy: { source, destination, size } }),
                finish: () => ({ commands }),
            }
        },
        createBuffer(descriptor) {
            const buffer = {
                descriptor,
                data: new Uint8Array(descriptor.size).map((_, index) => index % 251),
                mapAsync: () => Promise.resolve(),
                getMappedRange: () => buffer.data.buffer,
                unmap() {},
                destroy() { buffer.destroyed = true },
            }
            buffers.push(buffer)
            return buffer
        },
        createSampler: () => ({}),
        createShaderModule: () => ({}),
        createRenderPipeline: descriptor => ({ descriptor, getBindGroupLayout: () => ({}) }),
        createBindGroup: () => ({}),
    }
}

function backendFor(browser, { requested = DISPLAY_P3, p3 = true } = {}) {
    const gpu = device()
    const ctx = context(browser)
    const env = display(p3)
    const configured = configureWebGPUCanvas(ctx, { ...configuration, device: gpu }, { requested, env })
    const backend = new WebGPUBackend(gpu, ctx, {
        canvasConfiguration: configured.configuration,
        colorOutput: configured.colorOutput,
        colorRequest: { requested, configuration: { ...configuration, device: gpu }, env },
    })
    backend.textures.set('out', { width: 4, height: 2, view: {} })
    return { backend, gpu, ctx, env }
}

test('the backend takes its canvas format from the configuration, not from getPreferredCanvasFormat()', () => {
    globalThis.navigator ??= {}
    const previous = globalThis.navigator.gpu
    globalThis.navigator.gpu = { getPreferredCanvasFormat: () => 'rgba8unorm' }
    try {
        const wide = backendFor('supports').backend
        assert.equal(wide.canvasFormat, 'rgba16float')
        assert.equal(wide.colorOutput, DISPLAY_P3)
        assert.equal(wide.getBlitPipeline().descriptor.fragment.targets[0].format, 'rgba16float', 'the blit target follows the canvas format')
        const narrow = backendFor('drops').backend
        assert.equal(narrow.canvasFormat, 'bgra8unorm')
        assert.equal(narrow.colorOutput, SRGB)
        const configuredOnly = new WebGPUBackend(device(), { getConfiguration: () => ({ format: 'bgra8unorm' }) })
        assert.equal(configuredOnly.canvasFormat, 'bgra8unorm', 'without options, the read-back configuration decides')
        assert.equal(configuredOnly.colorOutput, SRGB)
    } finally {
        globalThis.navigator.gpu = previous
    }
})

test('a display change reconfigures the canvas at the next frame', () => {
    const { backend, ctx, env } = backendFor('supports')
    const blit = backend.getBlitPipeline()
    env.change(false)
    assert.equal(backend.colorOutput, DISPLAY_P3, 'nothing changes before the next frame')
    assert.equal(ctx.configures.length, 1)
    backend.beginFrame()
    assert.equal(backend.colorOutput, SRGB)
    assert.equal(backend.canvasFormat, 'bgra8unorm')
    assert.deepEqual(ctx.configures.at(-1), { ...configuration, device: backend.device })
    assert.notEqual(backend.getBlitPipeline(), blit, 'the blit pipeline is made again for the new format')
    assert.equal(backend.getBlitPipeline().descriptor.fragment.targets[0].format, 'bgra8unorm')
    env.change(true)
    backend.beginFrame()
    assert.equal(backend.colorOutput, DISPLAY_P3)
    assert.equal(backend.canvasFormat, 'rgba16float')
    backend.beginFrame()
    assert.equal(ctx.configures.length, 3, 'a frame with no change does not reconfigure')
    backend.destroy({ skipTextures: true })
    assert.equal(env.listeners.size, 0, 'destroy removes the display listener')
})

test('an srgb request does not follow the display', () => {
    const { backend, env } = backendFor('supports', { requested: SRGB })
    assert.equal(env.listeners.size, 0)
    assert.equal(backend.colorOutput, SRGB)
})

test('on the display-p3 path, the canvas copy is encoded in the same submission as the present blit', async () => {
    const { backend, gpu } = backendFor('supports')
    const copied = backend.readCanvasCopy()
    const other = backend.readCanvasCopy()
    backend.present('out')
    assert.equal(gpu.submissions.length, 1, 'one submission')
    const [render, draw, copy] = gpu.submissions[0]
    assert.deepEqual([render, draw], ['render', 'draw'])
    assert.ok(copy?.copy, 'the copy follows the blit in the same submission')
    assert.equal(copy.copy.destination.bytesPerRow, 256, 'rows are padded to 256 bytes')
    assert.deepEqual(copy.copy.size, { width: 4, height: 2 })
    const frame = await copied
    assert.deepEqual([frame.width, frame.height, frame.format, frame.bytesPerPixel], [4, 2, 'rgba16float', 8])
    assert.equal(frame.data.length, 4 * 2 * 8, 'the padding is removed')
    assert.deepEqual(Array.from(frame.data.subarray(32, 36)), [256 % 251, 257 % 251, 258 % 251, 259 % 251], 'the second row starts after the padding')
    const otherFrame = await other
    assert.notEqual(otherFrame.data, frame.data, 'each request gets its own pixel array')
    assert.deepEqual(otherFrame.data, frame.data)
    assert.equal(gpu.buffers.length, 1, 'requests that wait for the same present share one copy')
    assert.equal(gpu.buffers.at(-1).destroyed, true)
    backend.present('out')
    assert.equal(gpu.submissions[1].some(command => command.copy), false, 'a present with no request makes no copy')
})

test('a copy that waits while the display leaves P3 is refused, and the present makes no copy', async () => {
    const { backend, gpu, env } = backendFor('supports')
    const copied = backend.readCanvasCopy()
    env.change(false)
    backend.beginFrame()
    await assert.rejects(copied, /display-p3/)
    backend.present('out')
    assert.equal(gpu.submissions.at(-1).some(command => command.copy), false, 'no copy of a canvas without COPY_SRC')
})

test('a pipeline disposed after its backend was lost stops following the display and refuses a waiting copy', async () => {
    const { backend, env } = backendFor('supports')
    assert.equal(env.listeners.size, 1, 'the backend follows the display')
    const copied = backend.readCanvasCopy()
    const pipeline = Object.assign(Object.create(Pipeline.prototype), {
        _asyncRenders: new Map(),
        sinkManager: { close() {} },
        surfaces: new Map(),
        backend,
    })
    pipeline.dispose({ backendLost: true })
    assert.equal(env.listeners.size, 0, 'the display listener is removed')
    await assert.rejects(copied, /before the next present/)
    const later = backend.readCanvasCopy().then(() => 'resolved', error => error.message)
    const settled = await Promise.race([later, new Promise(resolve => setImmediate(() => resolve('waiting')))])
    assert.match(settled, /released/, 'a later request on the released backend is refused at once')
})

test('destroy() refuses a waiting copy and removes the display listener', async () => {
    const { backend, env } = backendFor('supports')
    assert.equal(env.listeners.size, 1, 'the backend follows the display')
    const copied = backend.readCanvasCopy()
    backend.destroy({ skipTextures: true })
    await assert.rejects(copied, /destroyed before the next present/)
    assert.equal(env.listeners.size, 0)
})

test('a destroy() that fails part way has already released the display listener and the waiting copies', async () => {
    const { backend, env } = backendFor('supports')
    assert.equal(env.listeners.size, 1, 'the backend follows the display')
    const copied = backend.readCanvasCopy()
    backend.textures.clear()
    backend.textures.set('broken', { handle: { destroy() { throw new Error('texture teardown failed') } } })
    assert.throws(() => backend.destroy(), /texture teardown failed/)
    assert.equal(env.listeners.size, 0)
    await assert.rejects(copied, /destroyed before the next present/)
})

test('a copy whose mapped buffer cannot be read is refused', async () => {
    const { backend, gpu } = backendFor('supports')
    const createBuffer = gpu.createBuffer
    gpu.createBuffer = descriptor => Object.assign(createBuffer(descriptor), { getMappedRange() { throw new Error('the mapped range is gone') } })
    const copied = backend.readCanvasCopy().then(() => 'resolved', error => error.message)
    backend.present('out')
    const settled = await Promise.race([copied, new Promise(resolve => setImmediate(() => resolve('waiting')))])
    assert.equal(settled, 'the mapped range is gone')
    assert.equal(gpu.buffers.at(-1).destroyed, true)
})

test('a configuration without usage gets the canvas default, RENDER_ATTACHMENT, on the display-p3 path', () => {
    const ctx = context('supports')
    const { usage: _, ...withoutUsage } = configuration
    const result = configureWebGPUCanvas(ctx, withoutUsage, { requested: DISPLAY_P3, env: display(true) })
    assert.equal(result.colorOutput, DISPLAY_P3)
    assert.equal(result.configuration.usage, 0x10 | 0x01)
    assert.equal(ctx.configures.at(-1).usage, 0x10 | 0x01, 'the canvas is configured with that usage')
})

test('a pipeline whose initialization fails leaves no display listener behind', async () => {
    const env = display(true)
    const ctx = context('supports')
    globalThis.navigator ??= {}
    const saved = { gpu: globalThis.navigator.gpu, matchMedia: globalThis.matchMedia, isAvailable: WebGPUBackend.isAvailable, init: Pipeline.prototype.init }
    globalThis.navigator.gpu = {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({
            features: new Set(),
            limits: { maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 8192 },
            requestDevice: async () => device(),
        }),
    }
    globalThis.matchMedia = env.matchMedia
    WebGPUBackend.isAvailable = async () => true
    let followed = null
    Pipeline.prototype.init = async () => {
        followed = env.listeners.size
        throw new Error('the first compile failed')
    }
    try {
        await assert.rejects(
            createPipeline({}, { canvas: { getContext: () => ctx }, preferWebGPU: true, colorOutput: DISPLAY_P3 }),
            /the first compile failed/,
        )
        assert.equal(ctx.configures.at(-1).colorSpace, DISPLAY_P3, 'the canvas was configured for Display P3')
        assert.equal(followed, 1, 'the backend followed the display while it initialized')
        assert.equal(env.listeners.size, 0, 'the failed pipeline does not follow the display')
    } finally {
        globalThis.navigator.gpu = saved.gpu
        if (saved.matchMedia === undefined) delete globalThis.matchMedia
        else globalThis.matchMedia = saved.matchMedia
        WebGPUBackend.isAvailable = saved.isAvailable
        Pipeline.prototype.init = saved.init
    }
})

test('a copy larger than the device allows is refused, and the present still submits the blit', async () => {
    const { backend, gpu } = backendFor('supports')
    const rows = 2, bytesPerRow = 256
    gpu.limits = { maxBufferSize: rows * bytesPerRow - 1 }
    const copied = backend.readCanvasCopy()
    backend.present('out')
    await assert.rejects(copied, /maxBufferSize/)
    assert.deepEqual(gpu.submissions.at(-1), ['render', 'draw'], 'the blit is submitted without the copy')
    assert.equal(gpu.buffers.length, 0, 'no copy buffer is made')
    gpu.limits = { maxBufferSize: rows * bytesPerRow }
    const fits = backend.readCanvasCopy()
    backend.present('out')
    assert.equal((await fits).data.length, 4 * 2 * 8, 'a copy within the limit is made')
})

test('the srgb path has no canvas copy', async () => {
    const { backend, gpu } = backendFor('drops')
    await assert.rejects(backend.readCanvasCopy(), /display-p3/)
    backend.present('out')
    assert.equal(gpu.submissions[0].some(command => command.copy), false)
})
