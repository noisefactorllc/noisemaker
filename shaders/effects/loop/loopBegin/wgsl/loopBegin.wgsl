/**
 * begin - Blend input with accumulator buffer using lighten mode
 *
 * Reads from the shared accumulator texture (feedback from previous frame)
 * and blends with the current input using max (lighten) blend mode.
 * The result passes through to the next effect in the chain.
 */

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var accumTex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> alpha : f32;
@group(0) @binding(4) var<uniform> intensity : f32;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let inputColor = textureSample(inputTex, samp, st);
    let accum = textureSample(accumTex, samp, st);

    // Normalize alpha from 0-100 to 0-1
    let a = alpha / 100.0;

    // Normalize intensity from 0-100 to 0-1
    let i = intensity / 100.0;

    // Lighten blend: max of input and accumulated
    let blended = max(inputColor, accum * i);

    // Mix between pure input and blended based on alpha
    var result = mix(inputColor, blended, a);

    // Preserve alpha
    result.a = max(inputColor.a, accum.a);

    return result;
}
