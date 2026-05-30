/*
 * Temporal Chromatic Aberration - shift pass (WGSL).
 * Mirrors glsl/delayShift.glsl: copies one stage of the bucket-brigade delay line into the
 * next, preserving alpha so the "filled" frontier advances one stage per frame.
 */

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var srcTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(srcTex, 0));
    let uv = pos.xy / texSize;
    return textureSampleLevel(srcTex, samp, uv, 0.0);
}
