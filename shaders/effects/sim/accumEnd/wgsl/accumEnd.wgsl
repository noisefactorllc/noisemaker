/**
 * accumEnd - Pass through input to output
 *
 * Simple passthrough shader for the accumEnd effect.
 * The actual feedback write happens in the copy pass.
 */

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;
    return textureSample(inputTex, samp, st);
}
