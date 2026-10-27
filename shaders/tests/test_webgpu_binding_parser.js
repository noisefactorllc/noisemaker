import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error)
        process.exit(1)
    }
}

function parseBindings(source) {
    const backend = Object.create(WebGPUBackend.prototype)
    return backend.parseShaderBindings(source)
}

test('WebGPU binding parser classifies cube textures as sampled textures', () => {
    const source = `
@group(0) @binding(0) var reflectionProbe: texture_cube<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn main() -> @location(0) vec4<f32> {
    return textureSampleLevel(reflectionProbe, samp, vec3f(0.0, 1.0, 0.0), 0.0);
}
`
    const bindings = parseBindings(source)
    const probe = bindings.find((binding) => binding.name === 'reflectionProbe')
    if (!probe || probe.type !== 'texture') {
        throw new Error(`cube binding was not classified as a texture: ${JSON.stringify(probe)}`)
    }
})

test('WebGPU binding parser ignores dead bindings mentioned only in block comments', () => {
    const source = `
@group(0) @binding(0) var liveTex: texture_2d<f32>;
@group(0) @binding(1) var deadTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

/*
 * deadTex used to be sampled here, but this pass no longer needs it.
 */
@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / vec2<f32>(64.0, 64.0);
    return textureSample(liveTex, samp, uv);
}
`

    const names = parseBindings(source).map((binding) => binding.name)

    if (names.includes('deadTex')) {
        throw new Error(`dead block-comment-only binding was retained: ${names.join(', ')}`)
    }
    if (!names.includes('liveTex') || !names.includes('samp')) {
        throw new Error(`live bindings were not preserved: ${names.join(', ')}`)
    }
})

test('WebGPU binding parser handles nested block comments', () => {
    const source = `
@group(0) @binding(0) var liveTex: texture_2d<f32>;
@group(0) @binding(1) var deadTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

/*
 * Outer comment start.
 * /*
 *  Nested comment mentions deadTex.
 * */
 * Outer comment also mentions deadTex.
 */
@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / vec2<f32>(64.0, 64.0);
    return textureSample(liveTex, samp, uv);
}
`

    const names = parseBindings(source).map((binding) => binding.name)

    if (names.includes('deadTex')) {
        throw new Error(`nested block-comment-only binding was retained: ${names.join(', ')}`)
    }
    if (!names.includes('liveTex') || !names.includes('samp')) {
        throw new Error(`live bindings were not preserved: ${names.join(', ')}`)
    }
})

test('WebGPU binding parser ignores block delimiters inside line comments', () => {
    const source = `
@group(0) @binding(0) var liveTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

// /* This is only a line comment and must not start a block comment.
@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / vec2<f32>(64.0, 64.0);
    return textureSample(liveTex, samp, uv);
}
// */ This is also only a line comment.
`

    const names = parseBindings(source).map((binding) => binding.name)

    if (!names.includes('liveTex') || !names.includes('samp')) {
        throw new Error(`line-comment block delimiters stripped live bindings: ${names.join(', ')}`)
    }
})

test('WebGPU binding parser ignores storage bindings declared only in comments', () => {
    const source = `
@group(0) @binding(0) var<uniform> volumeSize: i32;
/*
@group(0) @binding(1) var deadStorageTex: texture_storage_2d<rgba16float, write>;
*/
@group(0) @binding(2) var stateTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= u32(volumeSize) || id.y >= u32(volumeSize)) {
        return;
    }
    textureStore(stateTex, vec2<i32>(id.xy), vec4<f32>(1.0));
}
`

    const names = parseBindings(source).map((binding) => binding.name)

    if (names.includes('deadStorageTex')) {
        throw new Error(`commented-out storage texture binding was retained: ${names.join(', ')}`)
    }
    if (!names.includes('volumeSize') || !names.includes('stateTex')) {
        throw new Error(`live compute bindings were not preserved: ${names.join(', ')}`)
    }
})

// ---------------------------------------------------------------------------
// Cull state must be derived from the pass, identically on every WebGPU
// pipeline path, and must correspond to what WebGL2 does.
//
// WebGL2 culls with frontFace(CCW) on unflipped geometry. The WGSL mesh vertex
// shader flips clip-space Y, which reverses triangle winding in framebuffer
// space, so 'cw' is the WebGPU spelling of the same thing. Getting this wrong
// culls exactly the faces that should be kept.
// ---------------------------------------------------------------------------

import { resolveCullState } from '../src/runtime/backends/webgpu.js'

test('cull state leaves MRT passes uncalled unless asked', () => {
    // The MRT path also carries the fullscreen GPGPU passes that compute-style
    // effects compile down to, and WebGL2 only culls when drawMode is
    // 'triangles'. Defaulting to 'back' here culled those passes away entirely.
    const state = resolveCullState(undefined, 'none')
    if (state.cullMode !== 'none') throw new Error(`expected cullMode 'none', got '${state.cullMode}'`)
})

test('cull state defaults to back-face culling on the mesh path, matching WebGL2', () => {
    const state = resolveCullState(undefined, 'back')
    if (state.cullMode !== 'back') throw new Error(`expected cullMode 'back', got '${state.cullMode}'`)
    if (state.frontFace !== 'cw') throw new Error(`expected frontFace 'cw' for the Y-flipped mesh shader, got '${state.frontFace}'`)
})

test('an explicit cull mode overrides the fallback', () => {
    const state = resolveCullState('back', 'none')
    if (state.cullMode !== 'back') throw new Error(`explicit 'back' must win over fallback 'none', got '${state.cullMode}'`)
})

test('cull state honours an explicit none', () => {
    const state = resolveCullState('none')
    if (state.cullMode !== 'none') throw new Error(`expected cullMode 'none', got '${state.cullMode}'`)
})

test('cull state honours an explicit front', () => {
    const state = resolveCullState('front')
    if (state.cullMode !== 'front') throw new Error(`expected cullMode 'front', got '${state.cullMode}'`)
    if (state.frontFace !== 'cw') throw new Error(`expected frontFace 'cw', got '${state.frontFace}'`)
})

test('WebGPU binding parser classifies writable 3D storage textures', () => {
    const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    textureStore(volumeOut, vec3<i32>(gid), vec4<f32>(1.0));
}
`
    const [binding] = parseBindings(source)
    if (binding?.type !== 'storage_texture' || binding?.name !== 'volumeOut') {
        throw new Error(`3D storage texture was not classified: ${JSON.stringify(binding)}`)
    }
})

test('explicit compute entry point binds only its mapped 3D storage texture', () => {
    const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var otherOut: texture_storage_3d<rgba8unorm, write>;
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    textureStore(volumeOut, vec3<i32>(gid), vec4<f32>(1.0));
}
@compute @workgroup_size(4, 4, 4)
fn other(@builtin(global_invocation_id) gid: vec3<u32>) {
    textureStore(otherOut, vec3<i32>(gid), vec4<f32>(0.5));
}
`
    const backend = Object.create(WebGPUBackend.prototype)
    const volumeView = { label: 'volume' }
    backend.textures = new Map([['node_0_volume', { view: volumeView }]])
    backend.parseGlobalName = () => null
    backend.device = { createBindGroup: ({ entries }) => ({ entries }) }
    const bindings = backend.parseShaderBindings(source)
    const program = {
        module: {}, _sourceHasBindings: true, isCompute: true,
        pipeline: { getBindGroupLayout: () => ({}) },
        bindings, entryPointBindings: backend.parseEntryPointBindings(source, bindings)
    }
    const pass = { entryPoint: 'main', storageTextures: {
        volumeOut: 'node_0_volume', otherOut: 'node_0_volume'
    } }
    const entries = backend.createBindGroup(pass, program, { globalUniforms: {} }).entries
    if (entries.length !== 1 || entries[0].binding !== 0 || entries[0].resource !== volumeView) {
        throw new Error(`selected entry point got wrong storage bindings: ${JSON.stringify(entries)}`)
    }
})


test('selected entry point includes storage textures reached through helper calls', () => {
    const backend = Object.create(WebGPUBackend.prototype)
    const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var otherOut: texture_storage_3d<rgba8unorm, write>;
fn writeVolume() { textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0)); }
fn nested() { writeVolume(); }
@compute @workgroup_size(1) fn main() { nested(); /* otherOut belongs to another entry */ }
@compute @workgroup_size(1) fn other() { textureStore(otherOut, vec3<i32>(0), vec4<f32>(0.5)); }
`
    const selected = backend.parseEntryPointBindings(source, backend.parseShaderBindings(source))
    const actual = [...selected.get('main')].sort()
    if (JSON.stringify(actual) !== '[0]') {
        throw new Error(`helper storage binding set must be [0], got ${JSON.stringify(actual)}`)
    }
    if (JSON.stringify([...selected.get('other')]) !== '[1]') throw new Error('other entry leaked bindings')
})

test('helper struct members named like another entry resource do not bind that resource', () => {
    const backend = Object.create(WebGPUBackend.prototype)
    const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var otherOut: texture_storage_3d<rgba8unorm, write>;
struct Marker { otherOut: u32, }
fn writeVolume() {
    let marker = Marker(1u);
    if (marker.otherOut == 1u) {
        textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0));
    }
}
@compute @workgroup_size(1) fn main() { writeVolume(); }
@compute @workgroup_size(1) fn other() {
    textureStore(otherOut, vec3<i32>(0), vec4<f32>(0.5));
}
`
    const selected = backend.parseEntryPointBindings(source, backend.parseShaderBindings(source))
    if (JSON.stringify([...selected.get('main')]) !== '[0]') {
        throw new Error(`member name leaked an unrelated resource: ${JSON.stringify([...selected.get('main')])}`)
    }
    if (JSON.stringify([...selected.get('other')]) !== '[1]') throw new Error('other entry lost its resource')
})

test('helper parameters and local variables shadow unrelated storage resources', () => {
    const backend = Object.create(WebGPUBackend.prototype)
    const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var otherOut: texture_storage_3d<rgba8unorm, write>;
fn writeVolume(otherOut: u32) {
    if (otherOut == 1u) {
        textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0));
    }
}
fn nested() { let otherOut = 1u; writeVolume(otherOut); }
@compute @workgroup_size(1) fn main() { nested(); }
@compute @workgroup_size(1) fn other() {
    textureStore(otherOut, vec3<i32>(0), vec4<f32>(0.5));
}
`
    const selected = backend.parseEntryPointBindings(source, backend.parseShaderBindings(source))
    if (JSON.stringify([...selected.get('main')]) !== '[0]') {
        throw new Error(`shadowed name leaked an unrelated resource: ${JSON.stringify([...selected.get('main')])}`)
    }
    if (JSON.stringify([...selected.get('other')]) !== '[1]') throw new Error('other entry lost its resource')
})

test('a for-loop local stops shadowing the global storage resource after the loop', () => {
    const backend = Object.create(WebGPUBackend.prototype)
    const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
fn writeVolume() {
    for (var volumeOut = 0u; volumeOut < 1u; volumeOut = volumeOut + 1u) {}
    textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0));
}
@compute @workgroup_size(1) fn main() { writeVolume(); }
`
    const selected = backend.parseEntryPointBindings(source, backend.parseShaderBindings(source))
    if (JSON.stringify([...selected.get('main')]) !== '[0]') {
        throw new Error(`loop-local shadow leaked after its scope: ${JSON.stringify([...selected.get('main')])}`)
    }
})

test('a local declaration sees the global storage resource in its initializer', () => {
    const backend = Object.create(WebGPUBackend.prototype)
    for (const statement of [
        'let otherOut = textureDimensions(otherOut); if (otherOut.x == 8u) { textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0)); }',
        'var otherOut = textureDimensions(otherOut); if (otherOut.x == 8u) { textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0)); }',
        'for (var otherOut = textureDimensions(otherOut).x; otherOut > 0u; otherOut = otherOut - 1u) {} textureStore(volumeOut, vec3<i32>(0), vec4<f32>(1.0));'
    ]) {
        const source = `
@group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var otherOut: texture_storage_3d<rgba8unorm, write>;
fn writeVolume() { ${statement} }
@compute @workgroup_size(1) fn main() { writeVolume(); }
@compute @workgroup_size(1) fn other() {
    textureStore(otherOut, vec3<i32>(0), vec4<f32>(0.5));
}
`
        const selected = backend.parseEntryPointBindings(source, backend.parseShaderBindings(source))
        if (JSON.stringify([...selected.get('main')].sort((a, b) => a - b)) !== '[0,1]') {
            throw new Error(`initializer lost the global resource: ${statement}: ${JSON.stringify([...selected.get('main')])}`)
        }
    }
})
