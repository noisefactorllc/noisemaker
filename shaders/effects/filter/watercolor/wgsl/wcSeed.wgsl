/*
 * Watercolor - seed pass: copies the source image into the ping-pong state
 * texture before the iterated stride-median simplify passes run.
 */

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    return textureSample(inputTex, inputSampler, uv);
}
