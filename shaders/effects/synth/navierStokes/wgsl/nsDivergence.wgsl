/*
 * WGSL Navier-Stokes divergence pass.
 * Mirrors glsl/nsDivergence.glsl. Uses textureLoad on integer texel coords — the velocity
 * texture is rgba16f which is not guaranteed to be sampler-filterable in WebGPU.
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, _, _)
    data : array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var velTex : texture_2d<f32>;

fn fetchVel(idx: vec2<i32>, minIdx: vec2<i32>, maxIdx: vec2<i32>) -> vec2<f32> {
    return textureLoad(velTex, clamp(idx, minIdx, maxIdx), 0).rg;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<i32>(textureDimensions(velTex, 0));
    let texSizeF = vec2<f32>(texSize);
    let minIdx = vec2<i32>(0);
    let maxIdx = texSize - vec2<i32>(1);
    let fragCoord = pos.xy;
    let centerI = vec2<i32>(floor(fragCoord));

    var uR = fetchVel(centerI + vec2<i32>(1, 0),  minIdx, maxIdx);
    var uL = fetchVel(centerI + vec2<i32>(-1, 0), minIdx, maxIdx);
    var uT = fetchVel(centerI + vec2<i32>(0, 1),  minIdx, maxIdx);
    var uB = fetchVel(centerI + vec2<i32>(0, -1), minIdx, maxIdx);

    if (fragCoord.x < 1.0) { uL.x = -uR.x; }
    if (fragCoord.x > texSizeF.x - 1.0) { uR.x = -uL.x; }
    if (fragCoord.y < 1.0) { uB.y = -uT.y; }
    if (fragCoord.y > texSizeF.y - 1.0) { uT.y = -uB.y; }

    let div = 0.5 * ((uR.x - uL.x) + (uT.y - uB.y));

    return vec4<f32>(0.0, div, 0.0, 1.0);
}
