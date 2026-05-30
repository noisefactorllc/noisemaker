/*
 * Temporal Chromatic Aberration - shift pass (WGSL).
 * Mirrors glsl/delayShift.glsl: copies one stage of the bucket-brigade delay line into the
 * next, preserving alpha so the "filled" frontier advances one stage per frame. On reset,
 * fills from the live frame instead to clear trails instantly.
 */

struct Uniforms {
    // data[0] = (resetState, _, _, _)
    data : array<vec4<f32>, 1>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var srcTex : texture_2d<f32>;
@group(0) @binding(3) var liveTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resetState = uniforms.data[0].x > 0.5;

    let texSize = vec2<f32>(textureDimensions(srcTex, 0));
    let uv = pos.xy / texSize;

    if (resetState) {
        return textureSampleLevel(liveTex, samp, uv, 0.0);
    }

    return textureSampleLevel(srcTex, samp, uv, 0.0);
}
