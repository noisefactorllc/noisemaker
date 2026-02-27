/*
 * Radial vignette with brightness blend
 */

struct Uniforms {
    vignetteBrightness: f32,
    alpha: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn computeVignetteMask(uv: vec2<f32>, dims: vec2<f32>) -> f32 {
    if (dims.x <= 0.0 || dims.y <= 0.0) {
        return 0.0;
    }
    
    let delta = abs(uv - vec2<f32>(0.5));
    let aspect = dims.x / max(dims.y, 1.0);
    let scaled = vec2<f32>(delta.x * aspect, delta.y);
    let maxRadius = length(vec2<f32>(aspect * 0.5, 0.5));
    
    if (maxRadius <= 0.0) {
        return 0.0;
    }
    
    let normalizedDist = clamp(length(scaled) / maxRadius, 0.0, 1.0);
    return normalizedDist * normalizedDist;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    let texel = textureSample(inputTex, inputSampler, uv);
    
    let mask = computeVignetteMask(uv, texSize);
    
    // Apply brightness to RGB only, preserve alpha
    let brightnessRgb = vec3<f32>(uniforms.vignetteBrightness);
    let edgeBlend = mix(texel.rgb, brightnessRgb, mask);
    let finalRgb = mix(texel.rgb, edgeBlend, uniforms.alpha);
    
    return vec4<f32>(finalRgb, texel.a);
}
