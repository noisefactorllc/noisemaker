/*
 * Grade - Primary Correction Pass (WGSL)
 * White balance, exposure, contrast, tonal range operators, saturation
 * All math in linear color space
 */

struct Uniforms {
    gradeTemperature: f32,
    gradeTint: f32,
    gradeExposure: f32,
    gradeContrast: f32,
    gradeHighlights: f32,
    gradeShadows: f32,
    gradeWhites: f32,
    gradeBlacks: f32,
    gradeSaturation: f32,
    gradeCurveShadows: f32,
    gradeCurveMidtones: f32,
    gradeCurveHighlights: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const LUMA_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);

// sRGB to linear
fn srgbToLinear(srgb: vec3<f32>) -> vec3<f32> {
    var linear: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

// Linear to sRGB
fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// White balance using temperature/tint as chromatic adaptation
fn applyWhiteBalance(rgb: vec3<f32>, temp: f32, tint: f32) -> vec3<f32> {
    let shift = vec3<f32>(
        1.0 + temp * 0.5,
        1.0 - tint * 0.5,
        1.0 - temp * 0.5
    );
    return rgb * shift;
}

// Tonal weight functions
fn shadowWeight(luma: f32) -> f32 {
    return 1.0 - smoothstep(0.0, 0.5, luma);
}

fn highlightWeight(luma: f32) -> f32 {
    return smoothstep(0.5, 1.0, luma);
}

fn midtoneWeight(luma: f32) -> f32 {
    return 1.0 - abs(luma - 0.5) * 2.0;
}

fn whitesWeight(luma: f32) -> f32 {
    return smoothstep(0.7, 1.0, luma);
}

fn blacksWeight(luma: f32) -> f32 {
    return 1.0 - smoothstep(0.0, 0.3, luma);
}

// Apply tonal range adjustments
fn applyTonalRanges(rgb: vec3<f32>, highlights: f32, shadows: f32, whites: f32, blacks: f32) -> vec3<f32> {
    let luma = dot(rgb, LUMA_WEIGHTS);
    let chroma = rgb - luma;
    
    let hWeight = highlightWeight(luma);
    let sWeight = shadowWeight(luma);
    let wWeight = whitesWeight(luma);
    let bWeight = blacksWeight(luma);
    
    var lumaAdjust = 0.0;
    lumaAdjust += highlights * hWeight * 0.5;
    lumaAdjust += shadows * sWeight * 0.5;
    lumaAdjust += whites * wWeight * 0.3;
    lumaAdjust += blacks * bWeight * 0.3;
    
    let newLuma = max(luma + lumaAdjust, 0.0);
    
    return newLuma + chroma;
}

// S-curve contrast
fn applyContrast(rgb: vec3<f32>, contrast: f32) -> vec3<f32> {
    if (abs(contrast) < 0.001) { return rgb; }
    
    let luma = dot(rgb, LUMA_WEIGHTS);
    let chroma = rgb - luma;
    
    let pivot = 0.5;
    let factor = 1.0 + contrast;
    
    let newLuma = clamp((luma - pivot) * factor + pivot, 0.0, 1.5);
    
    return newLuma + chroma;
}

// Apply lift/gamma/gain style curve
fn applyCurve(rgb: vec3<f32>, shadowLift: f32, midGamma: f32, highGain: f32) -> vec3<f32> {
    let luma = dot(rgb, LUMA_WEIGHTS);
    let chroma = rgb - luma;
    
    let sW = shadowWeight(luma);
    let mW = midtoneWeight(luma);
    let hW = highlightWeight(luma);
    
    let lift = shadowLift * sW * 0.2;
    let gamma = 1.0 - midGamma * mW * 0.3;
    let gain = 1.0 + highGain * hW * 0.5;
    
    var newLuma = luma + lift;
    newLuma = pow(max(newLuma, 0.001), gamma);
    newLuma = newLuma * gain;
    
    return max(newLuma + chroma, vec3<f32>(0.0));
}

// Saturation adjustment
fn applySaturation(rgb: vec3<f32>, satAmount: f32) -> vec3<f32> {
    let luma = dot(rgb, LUMA_WEIGHTS);
    let chroma = rgb - luma;
    return luma + chroma * satAmount;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let color = textureSample(inputTex, inputSampler, uv);
    
    // Decode to linear
    var rgb = srgbToLinear(color.rgb);
    
    // 1. White Balance
    rgb = applyWhiteBalance(rgb, uniforms.gradeTemperature, uniforms.gradeTint);
    
    // 2. Exposure
    rgb = rgb * pow(2.0, uniforms.gradeExposure);
    
    // 3. Contrast
    rgb = applyContrast(rgb, uniforms.gradeContrast);
    
    // 4. Tonal Range Operators
    rgb = applyTonalRanges(rgb, uniforms.gradeHighlights, uniforms.gradeShadows, 
                           uniforms.gradeWhites, uniforms.gradeBlacks);
    
    // 5. Curves
    rgb = applyCurve(rgb, uniforms.gradeCurveShadows, uniforms.gradeCurveMidtones, 
                     uniforms.gradeCurveHighlights);
    
    // 6. Saturation
    rgb = applySaturation(rgb, uniforms.gradeSaturation);
    
    // Encode back to sRGB
    rgb = linearToSrgb(max(rgb, vec3<f32>(0.0)));
    
    return vec4<f32>(rgb, color.a);
}
