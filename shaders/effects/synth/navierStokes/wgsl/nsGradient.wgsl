/*
 * WGSL Navier-Stokes gradient subtraction (projection) pass.
 * Mirrors glsl/nsGradient.glsl. textureLoad on integer texel coords (rgba16f, no sampler).
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, _, _)
    data : array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var velTex : texture_2d<f32>;
@group(0) @binding(3) var pressureTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<i32>(textureDimensions(velTex, 0));
    let minIdx = vec2<i32>(0);
    let maxIdx = texSize - vec2<i32>(1);
    let centerI = vec2<i32>(floor(pos.xy));

    let pR = textureLoad(pressureTex, clamp(centerI + vec2<i32>(1, 0),  minIdx, maxIdx), 0).r;
    let pL = textureLoad(pressureTex, clamp(centerI + vec2<i32>(-1, 0), minIdx, maxIdx), 0).r;
    let pT = textureLoad(pressureTex, clamp(centerI + vec2<i32>(0, 1),  minIdx, maxIdx), 0).r;
    let pB = textureLoad(pressureTex, clamp(centerI + vec2<i32>(0, -1), minIdx, maxIdx), 0).r;

    let grad = 0.5 * vec2<f32>(pR - pL, pT - pB);

    let here = textureLoad(velTex, clamp(centerI, minIdx, maxIdx), 0);
    let u = here.rg - grad;

    return vec4<f32>(u, here.b, 1.0);
}
