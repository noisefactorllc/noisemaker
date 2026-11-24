// The present step of each backend: under 'srgb' its shader source is the
// one before the conversion existed, byte for byte; under 'display-p3' it runs
// the conversion; and a pass that writes to screen is refused under
// 'display-p3'.
import assert from 'node:assert/strict'
import test from 'node:test'
import { DISPLAY_P3, SRGB, refuseScreenOutput } from '../src/runtime/color-output.js'
import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'

globalThis.GPUTextureUsage ??= { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10 }

// The sources as they were before the present conversion.
const SRGB_PRESENT_GLSL = "#version 300 es\n        precision highp float;\n        in vec2 v_texCoord;\n        uniform sampler2D u_texture;\n        out vec4 fragColor;\n        void main() {\n            fragColor = texture(u_texture, v_texCoord);\n        }"
const SRGB_BLIT_WGSL = "\n            struct VertexOutput {\n                @builtin(position) position: vec4<f32>,\n                @location(0) uv: vec2<f32>,\n            }\n            \n            @vertex\n            fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {\n                var pos = array<vec2<f32>, 3>(\n                    vec2<f32>(-1.0, -1.0),\n                    vec2<f32>(3.0, -1.0),\n                    vec2<f32>(-1.0, 3.0)\n                );\n                // Standard UVs - internal blits now handle Y-flip\n                var uv = array<vec2<f32>, 3>(\n                    vec2<f32>(0.0, 0.0),\n                    vec2<f32>(2.0, 0.0),\n                    vec2<f32>(0.0, 2.0)\n                );\n                var output: VertexOutput;\n                output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);\n                output.uv = uv[vertexIndex];\n                return output;\n            }\n            \n            @group(0) @binding(0) var srcTex: texture_2d<f32>;\n            @group(0) @binding(1) var srcSampler: sampler;\n            \n            @fragment\n            fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {\n                return textureSample(srcTex, srcSampler, input.uv);\n            }\n        "

function webgl2(colorOutput) {
    const sources = []
    const gl = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3,
        createProgram: () => ({}), attachShader() {}, bindAttribLocation() {}, linkProgram() {},
        getProgramParameter: () => true, deleteShader() {}, getUniformLocation: () => ({}),
    }
    const backend = new WebGL2Backend(gl, null, { colorOutput })
    backend.compileShader = (type, source) => { if (type === gl.FRAGMENT_SHADER) sources.push(source); return {} }
    return { backend, sources }
}

function webgpu(colorOutput) {
    const modules = []
    const device = {
        queue: {},
        addEventListener() {},
        createShaderModule: descriptor => { modules.push(descriptor.code); return {} },
        createRenderPipeline: descriptor => ({ descriptor }),
    }
    const backend = new WebGPUBackend(device, null, { canvasConfiguration: { format: 'rgba16float' }, colorOutput })
    return { backend, modules }
}

test('under srgb, the WebGL2 present shader is the one before the conversion, byte for byte', () => {
    const { backend, sources } = webgl2(SRGB)
    backend.createPresentProgram()
    assert.deepEqual(sources, [SRGB_PRESENT_GLSL])
})

test('under display-p3, the WebGL2 present shader runs the conversion on the sampled pixel', () => {
    const { backend, sources } = webgl2(DISPLAY_P3)
    backend.createDisplayP3PresentProgram()
    assert.equal(sources.length, 1)
    assert.match(sources[0], /fragColor = nmPresentDisplayP3\(texture\(u_texture, v_texCoord\)\);/)
    assert.match(sources[0], /vec4 nmPresentDisplayP3\(vec4 c\)/)
})

test('under srgb, the WebGPU blit shader is the one before the conversion, byte for byte', () => {
    const { backend, modules } = webgpu(SRGB)
    backend.getBlitPipeline()
    assert.deepEqual(modules, [SRGB_BLIT_WGSL])
})

test('under display-p3, the WebGPU blit runs the conversion, and a change of output makes the blit again', () => {
    const { backend, modules } = webgpu(DISPLAY_P3)
    const p3 = backend.getBlitPipeline()
    assert.match(modules[0], /return nmPresentDisplayP3\(textureSample\(srcTex, srcSampler, input.uv\)\);/)
    assert.match(modules[0], /fn nmPresentDisplayP3\(c: vec4<f32>\) -> vec4<f32>/)
    assert.equal(backend.getBlitPipeline(), p3, 'the same output keeps its pipeline')
    backend.colorOutput = SRGB
    assert.notEqual(backend.getBlitPipeline(), p3)
    assert.equal(modules.at(-1), SRGB_BLIT_WGSL)
})

test('the refusal of a screen pass throws under display-p3, and not under srgb', () => {
    assert.throws(() => refuseScreenOutput(DISPLAY_P3, 'main'), /Pass main writes to screen/)
    assert.doesNotThrow(() => refuseScreenOutput(SRGB, 'main'))
})

test('both backends call the refusal where they bind the screen as a pass target', async () => {
    const { readFileSync } = await import('node:fs')
    const read = name => readFileSync(new URL(`../src/runtime/backends/${name}.js`, import.meta.url), 'utf8')
    assert.match(read('webgl2'), /if \(!fbo && outputId === 'screen'\) refuseScreenOutput\(this\.colorOutput, effectivePass\.id\)/)
    assert.match(read('webgpu'), /if \(!outputTex && outputId === 'screen' && this\.context\) \{\n\s*refuseScreenOutput\(this\.colorOutput, pass\.id\)/)
})

test('WebGL2 present() uses the conversion program under display-p3, follows a change of output, and skips frames when it does not link', () => {
    const used = []
    const gl = {
        FRAMEBUFFER: 1, COLOR_BUFFER_BIT: 2, TEXTURE0: 3, TEXTURE_2D: 4, TRIANGLES: 5,
        bindFramebuffer() {}, viewport() {}, clearColor() {}, clear() {}, activeTexture() {}, bindTexture() {},
        uniform1i() {}, bindVertexArray() {}, drawArrays() { used.push('draw') }, useProgram: program => used.push(program),
    }
    const backend = new WebGL2Backend(gl, null, { colorOutput: DISPLAY_P3 })
    backend.textures.set('out', { handle: {} })
    backend.presentProgram = { handle: 'srgb', uniforms: { texture: {} } }
    backend.fullscreenVAO = {}
    let made = 0
    backend.createDisplayP3PresentProgram = () => { made++; return { handle: 'p3', uniforms: { texture: {} } } }
    backend.present('out')
    backend.present('out')
    backend.colorOutput = SRGB
    backend.present('out')
    assert.deepEqual(used.filter(entry => entry !== null), ['p3', 'draw', 'p3', 'draw', 'srgb', 'draw'])
    assert.equal(made, 1, 'the conversion program is made once')

    const failing = new WebGL2Backend(gl, null, { colorOutput: DISPLAY_P3 })
    failing.textures.set('out', { handle: {} })
    failing.presentProgram = { handle: 'srgb', uniforms: { texture: {} } }
    failing.fullscreenVAO = {}
    let attempts = 0
    failing.createDisplayP3PresentProgram = () => { attempts++; return null }
    const error = console.error
    console.error = () => {}
    used.length = 0
    try {
        failing.present('out')
        failing.present('out')
    } finally {
        console.error = error
    }
    assert.deepEqual(used, [], 'no program is used and nothing is drawn')
    assert.equal(attempts, 1, 'a program that does not link is not made again every frame')

    const throwing = new WebGL2Backend(gl, null, { colorOutput: DISPLAY_P3 })
    throwing.textures.set('out', { handle: {} })
    throwing.presentProgram = { handle: 'srgb', uniforms: { texture: {} } }
    throwing.fullscreenVAO = {}
    let compiles = 0
    throwing.createDisplayP3PresentProgram = () => { compiles++; throw new Error('the shader did not compile') }
    console.error = () => {}
    try {
        assert.doesNotThrow(() => throwing.present('out'))
        throwing.present('out')
    } finally {
        console.error = error
    }
    assert.equal(compiles, 1, 'a program that does not compile is not compiled again every frame')
    assert.deepEqual(used, [])
})

test('a program that declares gamut p3 presents through the unclamped conversion on a Display P3 canvas, and as before on srgb', () => {
    const used = []
    const gl = {
        FRAMEBUFFER: 1, COLOR_BUFFER_BIT: 2, TEXTURE0: 3, TEXTURE_2D: 4, TRIANGLES: 5,
        bindFramebuffer() {}, viewport() {}, clearColor() {}, clear() {}, activeTexture() {}, bindTexture() {},
        uniform1i() {}, bindVertexArray() {}, drawArrays() {}, useProgram: program => used.push(program),
    }
    const backend = new WebGL2Backend(gl, null, { colorOutput: DISPLAY_P3 })
    backend.textures.set('out', { handle: {} })
    backend.presentProgram = { handle: 'srgb', uniforms: { texture: {} } }
    backend.fullscreenVAO = {}
    backend.createDisplayP3PresentProgram = ({ unclamped = false } = {}) => ({ handle: unclamped ? 'p3-unclamped' : 'p3', uniforms: { texture: {} } })
    backend.present('out', { gamut: 'p3' })
    backend.present('out')
    backend.colorOutput = SRGB
    backend.present('out', { gamut: 'p3' })
    assert.deepEqual(used.filter(entry => entry !== null), ['p3-unclamped', 'p3', 'srgb'])

    const { backend: gpu, modules } = webgpu(DISPLAY_P3)
    gpu.getBlitPipeline({ unclamped: true })
    assert.match(modules.at(-1), /return nmPresentDisplayP3Unclamped\(textureSample\(srcTex, srcSampler, input.uv\)\);/)
    gpu.getBlitPipeline()
    assert.match(modules.at(-1), /return nmPresentDisplayP3\(textureSample\(srcTex, srcSampler, input.uv\)\);/)
    gpu.colorOutput = SRGB
    gpu.getBlitPipeline({ unclamped: true })
    assert.equal(modules.at(-1), SRGB_BLIT_WGSL, 'srgb ignores the directive')
})

test('the canvas sink presents with the current program\'s gamut', async () => {
    const { CanvasSink } = await import('../src/runtime/sink.js')
    const calls = []
    let gamut = 'p3'
    const sink = new CanvasSink({ present: (id, options) => calls.push([id, options]) }, () => gamut)
    sink.submit('o0', 0)
    gamut = null
    sink.submit('o0', 0)
    assert.deepEqual(calls, [['o0', { gamut: 'p3' }], ['o0', { gamut: null }]])
    const plain = []
    new CanvasSink({ present: (id, options) => plain.push(options) }).submit('o0', 0)
    assert.deepEqual(plain, [{ gamut: null }])
})

test('the real WebGL2 program and WebGPU present() take the unclamped conversion for a program that declares gamut p3', () => {
    const { backend, sources } = webgl2(DISPLAY_P3)
    backend.createDisplayP3PresentProgram({ unclamped: true })
    backend.createDisplayP3PresentProgram()
    assert.match(sources[0], /fragColor = nmPresentDisplayP3Unclamped\(texture\(u_texture, v_texCoord\)\);/)
    assert.match(sources[1], /fragColor = nmPresentDisplayP3\(texture\(u_texture, v_texCoord\)\);/)

    const modules = []
    const device = {
        queue: { submit() {} },
        addEventListener() {},
        createShaderModule: descriptor => { modules.push(descriptor.code); return {} },
        createRenderPipeline: descriptor => ({ descriptor, getBindGroupLayout: () => ({}) }),
        createBindGroup: () => ({}),
        createCommandEncoder: () => ({
            beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }),
            finish: () => ({}),
        }),
    }
    const context = { canvas: { width: 4, height: 2 }, getCurrentTexture: () => ({ width: 4, height: 2, createView: () => ({}) }) }
    const gpu = new WebGPUBackend(device, context, { canvasConfiguration: { format: 'rgba16float' }, colorOutput: DISPLAY_P3 })
    gpu.textures.set('out', { width: 4, height: 2, view: {} })
    gpu.present('out', { gamut: 'p3' })
    assert.match(modules.at(-1), /return nmPresentDisplayP3Unclamped\(/)
    gpu.present('out')
    assert.match(modules.at(-1), /return nmPresentDisplayP3\(textureSample/)
})

test('the pipeline\'s canvas sink presents with the current graph\'s gamut, and follows a new graph', async () => {
    const { Pipeline } = await import('../src/runtime/pipeline.js')
    const calls = []
    const backend = { present: (id, options) => calls.push(options), getName: () => 'stub', textures: new Map() }
    const pipeline = new Pipeline({ passes: [], gamut: 'p3', renderSurface: 'o0' }, backend, {})
    const [registration] = pipeline.sinkManager._registrations
    registration.sink.submit('o0', 0)
    pipeline.graph = { ...pipeline.graph, gamut: null }
    registration.sink.submit('o0', 0)
    assert.deepEqual(calls, [{ gamut: 'p3' }, { gamut: null }])
})
