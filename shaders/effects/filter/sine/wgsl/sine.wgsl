/*
 * Sine wave distortion
 * RGB mode: apply sine to R, G, B independently
 * Non-RGB mode: convert to luminance, apply sine, output grayscale
 */

struct Uniforms {
    amount: f32,
    colorMode: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn normalized_sine(value: f32) -> f32 {
    return (sin(value) + 1.0) * 0.5;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let amount = uniforms.amount;
    let use_rgb = uniforms.colorMode > 0.5;

    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    var color = textureSample(inputTex, inputSampler, uv);

    if (use_rgb) {
        color.r = normalized_sine(color.r * amount);
        color.g = normalized_sine(color.g * amount);
        color.b = normalized_sine(color.b * amount);
    } else {
        let lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
        let result = normalized_sine(lum * amount);
        color = vec4<f32>(result, result, result, color.a);
    }

    return color;
}
