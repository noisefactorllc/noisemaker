/*
 * Simple copy/blit shader - copies input to output unchanged.
 * Used for feedback texture updates.
 */

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = pos.xy / dims;
    return textureSample(inputTex, inputSampler, uv);
}
