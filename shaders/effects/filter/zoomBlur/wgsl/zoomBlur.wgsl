/*
 * Zoom/radial blur effect
 * Creates a radial blur emanating from the center
 */

struct Uniforms {
    strength: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// PCG PRNG
fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(pcg(vec3<u32>(p))) / f32(0xffffffffu);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    var color = vec3<f32>(0.0);
    var total = 0.0;
    let toCenter = uv - 0.5;
    
    // Randomize the lookup values to hide the fixed number of samples
    let offset = prng(vec3<f32>(12.9898, 78.233, 151.7182)).x;
    
    for (var t = 0.0; t <= 40.0; t = t + 1.0) {
        let percent = (t + offset) / 40.0;
        let weight = 4.0 * (percent - percent * percent);
        let tex = textureSampleLevel(inputTex, inputSampler, uv + toCenter * percent * uniforms.strength, 0.0);
        color = color + tex.rgb * weight;
        total = total + weight;
    }
    
    color = color / total;
    
    return vec4<f32>(color, 1.0);
}
