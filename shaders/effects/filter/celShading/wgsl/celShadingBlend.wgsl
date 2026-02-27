/*
 * Cel Shading - Blend Pass
 * Combines cel-shaded color with edge outlines
 */

struct Uniforms {
    edgeColor: vec3f,
    mix: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var colorTex: texture_2d<f32>;
@group(0) @binding(3) var edgeTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    let origColor = textureSample(inputTex, inputSampler, uv);
    let celColor = textureSample(colorTex, inputSampler, uv);
    let edgeStrength = textureSample(edgeTex, inputSampler, uv).r;
    
    // Apply edge color where edges are detected
    var finalColor = mix(celColor.rgb, uniforms.edgeColor, edgeStrength);
    
    // Mix with original based on mix amount
    finalColor = mix(origColor.rgb, finalColor, uniforms.mix);
    
    return vec4f(finalColor, origColor.a);
}
