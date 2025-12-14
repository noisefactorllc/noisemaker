/*
 * Grade - Creative Pass
 * Vibrance, faded film, shadow/highlight tinting (split tone)
 * All math in linear color space
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float gradeVibrance;
uniform float gradeFadedFilm;
uniform vec3 gradeShadowTint;
uniform vec3 gradeHighlightTint;
uniform float gradeSplitToneBalance;

out vec4 fragColor;

const vec3 LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

// sRGB to linear
vec3 srgbToLinear(vec3 srgb) {
    vec3 linear;
    for (int i = 0; i < 3; i++) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

// Linear to sRGB
vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; i++) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// Vibrance: boost low-saturation colors, protect already-saturated and skin tones
vec3 applyVibrance(vec3 rgb, float vibrance) {
    if (abs(vibrance) < 0.001) return rgb;
    
    float luma = dot(rgb, LUMA_WEIGHTS);
    vec3 chroma = rgb - luma;
    
    // Current saturation approximation
    float maxC = max(max(rgb.r, rgb.g), rgb.b);
    float minC = min(min(rgb.r, rgb.g), rgb.b);
    float sat = (maxC > 0.001) ? (maxC - minC) / maxC : 0.0;
    
    // Vibrance preferentially affects low-saturation colors
    // Higher existing saturation = less boost
    float vibranceGain = 1.0 + vibrance * (1.0 - sat);
    
    // Skin tone protection: reduce effect on orange-red hues
    // Approximate skin hue detection
    float skinFactor = 1.0;
    if (rgb.r > rgb.g && rgb.g > rgb.b) {
        // Orange-ish hue range
        float hueScore = (rgb.r - rgb.b) / (maxC - minC + 0.001);
        skinFactor = smoothstep(0.3, 0.7, sat) * 0.5 + 0.5;
    }
    
    float finalGain = mix(1.0, vibranceGain, skinFactor);
    
    return luma + chroma * finalGain;
}

// Faded film: lift the blacks (toe lift)
vec3 applyFadedFilm(vec3 rgb, float amount) {
    if (amount < 0.001) return rgb;
    
    // Lift blacks by mixing toward mid-gray
    vec3 lifted = mix(rgb, vec3(0.2), amount * 0.5);
    
    // Also reduce overall contrast slightly
    float luma = dot(lifted, LUMA_WEIGHTS);
    vec3 chroma = lifted - luma;
    
    float pivot = 0.5;
    float contrastFactor = 1.0 - amount * 0.3;
    float newLuma = (luma - pivot) * contrastFactor + pivot;
    
    return newLuma + chroma * (1.0 - amount * 0.2);
}

// Split toning: apply different tints to shadows and highlights
vec3 applySplitTone(vec3 rgb, vec3 shadowTint, vec3 highlightTint, float balance) {
    // Tints are specified as 0.5 = neutral, deviation = color shift
    vec3 shadowShift = (shadowTint - 0.5) * 2.0;
    vec3 highlightShift = (highlightTint - 0.5) * 2.0;
    
    // Skip if both are neutral
    if (length(shadowShift) < 0.01 && length(highlightShift) < 0.01) {
        return rgb;
    }
    
    float luma = dot(rgb, LUMA_WEIGHTS);
    
    // Balance shifts the shadow/highlight boundary
    float balancePoint = 0.5 + balance * 0.3;
    
    // Smooth blending weights
    float shadowWeight = 1.0 - smoothstep(0.0, balancePoint, luma);
    float highlightWeight = smoothstep(balancePoint, 1.0, luma);
    
    // Apply tints additively
    vec3 tintedRgb = rgb;
    tintedRgb += shadowShift * shadowWeight * 0.3;
    tintedRgb += highlightShift * highlightWeight * 0.3;
    
    return tintedRgb;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Decode to linear
    vec3 rgb = srgbToLinear(color.rgb);
    
    // 1. Vibrance
    rgb = applyVibrance(rgb, gradeVibrance);
    
    // 2. Faded Film
    rgb = applyFadedFilm(rgb, gradeFadedFilm);
    
    // 3. Split Toning
    rgb = applySplitTone(rgb, gradeShadowTint, gradeHighlightTint, gradeSplitToneBalance);
    
    // Encode back to sRGB
    rgb = linearToSrgb(max(rgb, vec3(0.0)));
    
    fragColor = vec4(rgb, color.a);
}
