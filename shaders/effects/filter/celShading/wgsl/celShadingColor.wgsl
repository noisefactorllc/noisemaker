/*
 * Cel Shading - Color Pass
 * Applies color quantization and diffuse shading
 */

struct Uniforms {
    lightDirection: vec3f,
    levels: i32,
    shadingStrength: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

// Quantize a single value using round quantization
fn quantizeValue(value: f32, lev: f32) -> f32 {
    if (lev <= 1.0) {
        return value;
    }
    
    let gamma = 0.65;
    let corrected = pow(value, gamma);
    
    // Round quantization - centered steps
    let quantized = floor(corrected * lev + 0.5) / lev;
    
    return pow(quantized, 1.0 / gamma);
}

// Per-channel quantization
fn quantizeColor(color: vec3f, lev: f32) -> vec3f {
    return vec3f(
        quantizeValue(color.r, lev),
        quantizeValue(color.g, lev),
        quantizeValue(color.b, lev)
    );
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    let origColor = textureSample(inputTex, inputSampler, uv);
    let lev = f32(uniforms.levels);
    
    // Apply diffuse shading based on light direction
    // Use a simple gradient based on UV for subtle shading variation
    let lightDir = normalize(uniforms.lightDirection);
    let gradientShade = dot(normalize(vec3f(uv - 0.5, 0.5)), lightDir);
    let diffuse = 0.5 + 0.5 * gradientShade;
    
    // Apply shading to color
    let shadeFactor = mix(1.0, 0.5 + 0.5 * diffuse, uniforms.shadingStrength);
    let shadedColor = origColor.rgb * shadeFactor;
    
    // Quantize the color
    let quantizedColor = quantizeColor(shadedColor, lev);
    
    return vec4f(quantizedColor, origColor.a);
}
