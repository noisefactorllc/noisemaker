/*
 * Bloom composite pass
 * Adds tinted bloom to the original HDR scene
 * All operations in linear color space
 */

struct Uniforms {
    intensity: f32,
    tint: vec3<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    // Get original scene color (HDR)
    let sceneColor = textureSample(inputTex, inputSampler, uv);
    
    // Get bloom color
    var bloom = textureSample(bloomTex, inputSampler, uv).rgb;
    
    // Apply tint
    bloom *= uniforms.tint;

    // Additive blend: finalHDR = sceneColor + intensity * bloom
    let finalRgb = sceneColor.rgb + uniforms.intensity * bloom;
    
    return vec4<f32>(finalRgb, sceneColor.a);
}
