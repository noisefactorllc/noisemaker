/*
 * Grade - Creative Pass (WGSL)
 * Vibrance, faded film, shadow/highlight tinting (split tone)
 * All math in linear color space
 */

struct Uniforms {
    gradeVibrance: f32,
    gradeFadedFilm: f32,
    gradeSplitToneBalance: f32,
    _pad0: f32,
    gradeShadowTint: vec3<f32>,
    _pad1: f32,
    gradeHighlightTint: vec3<f32>,
    _pad2: f32,
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

// Vibrance: boost low-saturation colors, protect already-saturated and skin tones
fn applyVibrance(rgb: vec3<f32>, vibrance: f32) -> vec3<f32> {
    if (abs(vibrance) < 0.001) { return rgb; }
    
    let luma = dot(rgb, LUMA_WEIGHTS);
    let chroma = rgb - luma;
    
    let maxC = max(max(rgb.r, rgb.g), rgb.b);
    let minC = min(min(rgb.r, rgb.g), rgb.b);
    var sat: f32;
    if (maxC > 0.001) {
        sat = (maxC - minC) / maxC;
    } else {
        sat = 0.0;
    }
    
    let vibranceGain = 1.0 + vibrance * (1.0 - sat);
    
    // Skin tone protection
    var skinFactor = 1.0;
    if (rgb.r > rgb.g && rgb.g > rgb.b) {
        skinFactor = smoothstep(0.3, 0.7, sat) * 0.5 + 0.5;
    }
    
    let finalGain = mix(1.0, vibranceGain, skinFactor);
    
    return luma + chroma * finalGain;
}

// Faded film: lift the blacks
fn applyFadedFilm(rgb: vec3<f32>, amount: f32) -> vec3<f32> {
    if (amount < 0.001) { return rgb; }
    
    let lifted = mix(rgb, vec3<f32>(0.2), amount * 0.5);
    
    let luma = dot(lifted, LUMA_WEIGHTS);
    let chroma = lifted - luma;
    
    let pivot = 0.5;
    let contrastFactor = 1.0 - amount * 0.3;
    let newLuma = (luma - pivot) * contrastFactor + pivot;
    
    return newLuma + chroma * (1.0 - amount * 0.2);
}

// Split toning
fn applySplitTone(rgb: vec3<f32>, shadowTint: vec3<f32>, highlightTint: vec3<f32>, balance: f32) -> vec3<f32> {
    let shadowShift = (shadowTint - 0.5) * 2.0;
    let highlightShift = (highlightTint - 0.5) * 2.0;
    
    if (length(shadowShift) < 0.01 && length(highlightShift) < 0.01) {
        return rgb;
    }
    
    let luma = dot(rgb, LUMA_WEIGHTS);
    let balancePoint = 0.5 + balance * 0.3;
    
    let shadowW = 1.0 - smoothstep(0.0, balancePoint, luma);
    let highlightW = smoothstep(balancePoint, 1.0, luma);
    
    var tintedRgb = rgb;
    tintedRgb += shadowShift * shadowW * 0.3;
    tintedRgb += highlightShift * highlightW * 0.3;
    
    return tintedRgb;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let color = textureSample(inputTex, inputSampler, uv);
    
    var rgb = srgbToLinear(color.rgb);
    
    // 1. Vibrance
    rgb = applyVibrance(rgb, uniforms.gradeVibrance);
    
    // 2. Faded Film
    rgb = applyFadedFilm(rgb, uniforms.gradeFadedFilm);
    
    // 3. Split Toning
    rgb = applySplitTone(rgb, uniforms.gradeShadowTint, uniforms.gradeHighlightTint, 
                         uniforms.gradeSplitToneBalance);
    
    rgb = linearToSrgb(max(rgb, vec3<f32>(0.0)));
    
    return vec4<f32>(rgb, color.a);
}
