/*
 * Convolution Feedback - Blend Pass
 * Blends processed feedback texture with input based on intensity
 */

struct Uniforms {
    sharpenRadius: i32,
    blurRadius: i32,
    sharpenAmount: f32,
    blurAmount: f32,
    intensity: f32,
    resetState: i32,
    _pad2: f32,
    _pad3: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var feedbackTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(in.position.xy);
    
    let input = textureLoad(inputTex, coord, 0);
    
    // If resetState is true, bypass feedback and return input directly
    if (uniforms.resetState != 0) {
        return input;
    }
    
    let feedback = textureLoad(feedbackTex, coord, 0);
    
    // Blend input with processed feedback based on intensity
    let result = mix(input.rgb, feedback.rgb, uniforms.intensity);
    
    return vec4<f32>(result, input.a);
}
