/*
 * WGSL Navier-Stokes pressure pass (Jacobi iteration).
 * Mirrors glsl/nsPressure.glsl. textureLoad on integer texel coords (rgba16f, no sampler).
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, _, _)
    data : array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var bufTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<i32>(textureDimensions(bufTex, 0));
    let minIdx = vec2<i32>(0);
    let maxIdx = texSize - vec2<i32>(1);
    let centerI = vec2<i32>(floor(pos.xy));

    let pR = textureLoad(bufTex, clamp(centerI + vec2<i32>(1, 0),  minIdx, maxIdx), 0).r;
    let pL = textureLoad(bufTex, clamp(centerI + vec2<i32>(-1, 0), minIdx, maxIdx), 0).r;
    let pT = textureLoad(bufTex, clamp(centerI + vec2<i32>(0, 1),  minIdx, maxIdx), 0).r;
    let pB = textureLoad(bufTex, clamp(centerI + vec2<i32>(0, -1), minIdx, maxIdx), 0).r;

    let div = textureLoad(bufTex, clamp(centerI, minIdx, maxIdx), 0).g;

    let p = (pR + pL + pT + pB - div) * 0.25;

    return vec4<f32>(p, div, 0.0, 1.0);
}
