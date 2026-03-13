/*
 * Invert brightness effect
 * Simple RGB inversion: 1.0 - value
 */

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    var color = textureSample(inputTex, inputSampler, uv);

    color = vec4<f32>(1.0 - color.rgb, color.a);

    return color;
}
