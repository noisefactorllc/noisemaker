/*
 * ThresholdMix mixer shader (WGSL)
 * Combines two input textures using threshold masking with optional posterization
 * Supports luminance-based or per-channel RGB thresholding
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> mode: i32;
@group(0) @binding(4) var<uniform> quantize: i32;
@group(0) @binding(5) var<uniform> mapSource: i32;
@group(0) @binding(6) var<uniform> threshold: f32;
@group(0) @binding(7) var<uniform> range: f32;
@group(0) @binding(8) var<uniform> thresholdR: f32;
@group(0) @binding(9) var<uniform> rangeR: f32;
@group(0) @binding(10) var<uniform> thresholdG: f32;
@group(0) @binding(11) var<uniform> rangeG: f32;
@group(0) @binding(12) var<uniform> thresholdB: f32;
@group(0) @binding(13) var<uniform> rangeB: f32;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

// Quantize a value into discrete bands
fn quantizeValue(value: f32, bands: i32) -> f32 {
    if (bands <= 0) {
        return value;
    }
    let numBands = f32(bands);
    return floor(value * numBands) / numBands;
}

// Calculate blend factor with threshold and range
// Returns 0 for values below threshold, 1 for values above threshold+range
// Smooth transition in between
fn calculateBlendFactor(mapValue: f32, thresh: f32, rng: f32) -> f32 {
    if (rng <= 0.0) {
        // Hard threshold
        return step(thresh, mapValue);
    } else {
        // Soft threshold with range
        let lower = thresh;
        let upper = thresh + rng;
        return smoothstep(lower, upper, mapValue);
    }
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2f(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;
    
    let colorA = textureSample(inputTex, samp, uv);
    let colorB = textureSample(tex, samp, uv);
    
    // Get map color based on mapSource
    var mapColor: vec3f;
    if (mapSource == 0) {
        mapColor = colorA.rgb;
    } else {
        mapColor = colorB.rgb;
    }
    
    // Apply quantization to map values if enabled
    if (quantize > 0) {
        mapColor.x = quantizeValue(mapColor.x, quantize);
        mapColor.y = quantizeValue(mapColor.y, quantize);
        mapColor.z = quantizeValue(mapColor.z, quantize);
    }
    
    var result: vec4f;
    
    if (mode == 0) {
        // Luminance mode - use single threshold for all channels
        let lum = getLuminosity(mapColor);
        let blendFactor = calculateBlendFactor(lum, threshold, range);
        result = mix(colorA, colorB, blendFactor);
    } else {
        // RGB mode - use separate threshold for each channel
        let blendR = calculateBlendFactor(mapColor.x, thresholdR, rangeR);
        let blendG = calculateBlendFactor(mapColor.y, thresholdG, rangeG);
        let blendB = calculateBlendFactor(mapColor.z, thresholdB, rangeB);
        
        result.x = mix(colorA.x, colorB.x, blendR);
        result.y = mix(colorA.y, colorB.y, blendG);
        result.z = mix(colorA.z, colorB.z, blendB);
        result.w = mix(colorA.w, colorB.w, (blendR + blendG + blendB) / 3.0);
    }
    
    return result;
}
