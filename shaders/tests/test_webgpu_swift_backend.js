import assert from 'node:assert/strict'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'

function backendWithUniformCapture() {
    const backend = Object.create(WebGPUBackend.prototype)
    backend._singleUniformFloat32 = new Float32Array(4)
    backend._singleUniformInt32 = new Int32Array(4)
    backend._singleUniformMat3Float32 = new Float32Array(12)
    const uploads = []
    backend.getBufferFromPool = () => ({ id: 'pooled-buffer' })
    backend.queue = { writeBuffer: (...args) => uploads.push(args) }
    return { backend, uploads }
}

{
    const { backend, uploads } = backendWithUniformCapture()
    const waveform = new Float32Array(128)
    waveform[0] = 0.125
    waveform[127] = 0.875
    backend.createSingleUniformBuffer(waveform, 'array<vec4<f32>, 32>')
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0][2], waveform.buffer, 'typed audio should upload without repacking')
    assert.equal(uploads[0][4], 512)
}

{
    const { backend, uploads } = backendWithUniformCapture()
    backend.textures = new Map()
    backend.samplers = new Map()
    backend.activeUniformBuffers = []
    backend.device = { createBindGroup: ({ entries }) => ({ entries }) }
    const waveform = Float32Array.from({ length: 128 }, (_, index) => index / 127)
    const program = {
        pipeline: { getBindGroupLayout: () => ({}) },
        bindings: [{ group: 0, binding: 0, name: 'audioWaveform',
            type: 'uniform', typeDecl: 'array<vec4<f32>, 32>' }]
    }
    const group = backend.createBindGroup({ uniforms: { audioWaveform: waveform } },
        program, { globalUniforms: {} })
    assert.equal(group.entries.length, 1)
    assert.equal(uploads.length, 1)
    assert.equal(uploads[0][2], waveform.buffer,
        'typed host audio must survive bind-group value validation')
    assert.equal(uploads[0][4], 512)
}

function samplerFor(filter, explicit, reordered = false) {
    const backend = Object.create(WebGPUBackend.prototype)
    const sampledView = { label: 'volume-view' }
    backend.textures = new Map([
        ['volume', { view: sampledView, is3D: true, filter }],
        ['surface', { view: { label: 'surface-view' } }]
    ])
    backend.samplers = new Map([
        ['nearest', { label: 'nearest' }],
        ['default', { label: 'linear' }]
    ])
    backend.parseGlobalName = () => null
    backend.device = { createBindGroup: ({ entries }) => ({ entries }) }
    const bindings = [
        { group: 0, binding: reordered ? 1 : 0, name: 'volTex', type: 'texture' },
        { group: 0, binding: reordered ? 0 : 1, name: 'volSampler', type: 'sampler' },
        { group: 0, binding: reordered ? 3 : 2, name: 'surfaceTex', type: 'texture' },
        { group: 0, binding: reordered ? 2 : 3, name: 'surfaceSampler', type: 'sampler' }
    ].sort((a, b) => a.binding - b.binding)
    const program = {
        pipeline: { getBindGroupLayout: () => ({}) },
        bindings,
        samplerTextureNames: backend.parseSamplerTextureUses(`
            // textureSample(surfaceTex, volSampler, uv) is dead commentary.
            fn main() -> vec4f {
                return textureSample(surfaceTex, surfaceSampler, vec2f(0.5)) +
                    textureSampleLevel(volTex, volSampler, vec3f(0.5), 0.0);
            }
        `)
    }
    const pass = {
        inputs: { volTex: 'volume', surfaceTex: 'surface' },
        samplerTypes: explicit ? { volSampler: explicit } : undefined
    }
    return backend.createBindGroup(pass, program, { globalUniforms: {} }).entries
}

for (const [filter, expected] of [['linear', 'linear'], ['nearest', 'nearest']]) {
    const entries = samplerFor(filter)
    assert.equal(entries.find(entry => entry.binding === 1).resource.label, expected)
    assert.equal(entries.find(entry => entry.binding === 3).resource.label, 'nearest',
        'the volume filter must not change a separate 2D sampler')
}
assert.equal(samplerFor('linear', 'nearest').find(entry => entry.binding === 1).resource.label,
    'nearest', 'explicit samplerTypes must take precedence')
for (const [filter, expected] of [['linear', 'linear'], ['nearest', 'nearest']]) {
    const reordered = samplerFor(filter, undefined, true)
    assert.equal(reordered.find(entry => entry.binding === 0).resource.label, expected,
        'the sampler may be declared before its volume texture')
    assert.equal(reordered.find(entry => entry.binding === 2).resource.label, 'nearest',
        'the unrelated 2D sampler must retain nearest filtering')
}

console.log('PASS: typed audio uniform and declared 3D sampler bindings')
