// The wide-gamut support checks of shaders/src/runtime/color-output.js, each with
// a stub of the browser behavior it reads.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
    COLOR_OUTPUTS, DISPLAY_P3, SRGB, configureWebGL2ColorOutput, configureWebGPUColorOutput,
    displaySupportsP3, resolveColorOutput, webgpuConfiguredColorSpace,
} from '../src/runtime/color-output.js'

const display = matches => ({ matchMedia: query => ({ media: query, matches: query === '(color-gamut: p3)' && matches }) })

// A WebGPU context that keeps the members it knows and drops the others, as WebIDL does.
function webgpuContext({ knowsColorSpace = true, acceptsP3 = true, hasGetConfiguration = true } = {}) {
    const configures = []
    let current = null
    const context = {
        configures,
        configure(configuration) {
            configures.push(configuration)
            const kept = { ...configuration }
            if (!knowsColorSpace) delete kept.colorSpace
            else if (kept.colorSpace === DISPLAY_P3 && !acceptsP3) throw new TypeError('unsupported color space')
            else kept.colorSpace ??= SRGB
            current = kept
        },
    }
    if (hasGetConfiguration) context.getConfiguration = () => current
    return context
}

// A WebGL2 context with or without drawingBufferColorSpace.
function webgl2Context({ hasProperty = true, acceptsP3 = true } = {}) {
    if (!hasProperty) return {}
    let space = SRGB
    return {
        get drawingBufferColorSpace() { return space },
        set drawingBufferColorSpace(value) { if (value === SRGB || (value === DISPLAY_P3 && acceptsP3)) space = value },
    }
}

const configuration = { device: {}, format: 'bgra8unorm', alphaMode: 'premultiplied' }

test('the outputs are srgb and display-p3', () => {
    assert.deepEqual(COLOR_OUTPUTS, ['srgb', 'display-p3'])
})

test('the display check reads the color-gamut media query, and fails closed', () => {
    assert.equal(displaySupportsP3(display(true)), true)
    assert.equal(displaySupportsP3(display(false)), false)
    assert.equal(displaySupportsP3({}), false, 'no matchMedia')
    assert.equal(displaySupportsP3({ matchMedia: () => { throw new Error('denied') } }), false)
    assert.equal(displaySupportsP3(undefined), false)
})

test('WebGPU reports display-p3 only when the configuration reads it back', () => {
    const context = webgpuContext()
    assert.equal(configureWebGPUColorOutput(context, configuration), DISPLAY_P3)
    assert.deepEqual(context.configures.at(-1), { ...configuration, colorSpace: DISPLAY_P3, toneMapping: { mode: 'standard' } })
    assert.equal(webgpuConfiguredColorSpace(context), DISPLAY_P3)
})

test('WebGPU falls back to srgb when the browser drops the unknown colorSpace member', () => {
    const context = webgpuContext({ knowsColorSpace: false })
    assert.equal(configureWebGPUColorOutput(context, configuration), SRGB)
    assert.equal(context.configures.length, 2, 'the context is configured again')
    assert.equal(context.configures.at(-1).colorSpace, SRGB)
})

test('WebGPU falls back to srgb when configure() refuses display-p3', () => {
    const context = webgpuContext({ acceptsP3: false })
    assert.equal(configureWebGPUColorOutput(context, configuration), SRGB)
    assert.equal(context.configures.at(-1).colorSpace, SRGB, 'the context is configured in srgb')
    assert.equal(webgpuConfiguredColorSpace(context), SRGB)
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgpu', env: display(true), context: webgpuContext({ acceptsP3: false }), configuration }), SRGB)
})

test('WebGPU without getConfiguration() counts as unsupported', () => {
    const context = webgpuContext({ hasGetConfiguration: false })
    assert.equal(webgpuConfiguredColorSpace(context), SRGB)
    assert.equal(configureWebGPUColorOutput(context, configuration), SRGB)
    assert.equal(webgpuConfiguredColorSpace({ getConfiguration: () => { throw new Error('lost') } }), SRGB)
    assert.equal(webgpuConfiguredColorSpace({ getConfiguration: () => null }), SRGB)
})

test('WebGL2 reports display-p3 only when the drawing buffer reads it back', () => {
    const gl = webgl2Context()
    assert.equal(configureWebGL2ColorOutput(gl), DISPLAY_P3)
    assert.equal(gl.drawingBufferColorSpace, DISPLAY_P3)
    assert.equal(configureWebGL2ColorOutput(webgl2Context({ acceptsP3: false })), SRGB, 'the value is not taken')
})

test('WebGL2 without drawingBufferColorSpace is not given a plain property', () => {
    const gl = webgl2Context({ hasProperty: false })
    assert.equal(configureWebGL2ColorOutput(gl), SRGB)
    assert.equal('drawingBufferColorSpace' in gl, false)
    assert.equal(configureWebGL2ColorOutput(null), SRGB)
    const throwing = { get drawingBufferColorSpace() { return SRGB }, set drawingBufferColorSpace(_) { throw new TypeError('read-only') } }
    assert.equal(configureWebGL2ColorOutput(throwing), SRGB)
})

test('the resolved output is display-p3 only when it is requested and every check passes', () => {
    assert.equal(resolveColorOutput({ backend: 'webgl2', env: display(true), gl: webgl2Context() }), SRGB, 'srgb is the default')
    assert.equal(resolveColorOutput({ requested: SRGB, backend: 'webgl2', env: display(true), gl: webgl2Context() }), SRGB)
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgl2', env: display(true), gl: webgl2Context() }), DISPLAY_P3)
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgl2', env: display(false), gl: webgl2Context() }), SRGB, 'an sRGB display')
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgpu', env: display(true), context: webgpuContext(), configuration }), DISPLAY_P3)
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgpu', env: display(true), context: webgpuContext({ knowsColorSpace: false }), configuration }), SRGB)
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgpu', env: display(false), context: webgpuContext(), configuration }), SRGB)
    const untouched = webgpuContext()
    resolveColorOutput({ requested: DISPLAY_P3, backend: 'webgpu', env: display(false), context: untouched, configuration })
    assert.equal(untouched.configures.length, 0, 'an sRGB display is not configured for P3')
    assert.equal(resolveColorOutput({ requested: DISPLAY_P3, backend: 'cpu', env: display(true) }), SRGB)
    assert.equal(resolveColorOutput({ requested: 'rec2020', backend: 'webgl2', env: display(true), gl: webgl2Context() }), SRGB, 'only display-p3 asks for wide gamut')
})
