/*
 * Grade - Primary Correction Pass
 * White balance, exposure, contrast, tonal range operators, saturation
 * All math in linear color space
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float temperature;
uniform float tint;
uniform float exposure;
uniform float contrast;
uniform float highlights;
uniform float shadows;
uniform float whites;
uniform float blacks;
uniform float saturation;
uniform float curveShadows;
uniform float curveMidtones;
uniform float curveHighlights;

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

// White balance using temperature/tint as chromatic adaptation
vec3 applyWhiteBalance(vec3 rgb, float temp, float tint) {
    // Temperature: warm (positive) shifts toward orange, cool (negative) toward blue
    // Tint: positive shifts toward magenta, negative toward green
    vec3 shift = vec3(
        1.0 + temp * 0.5,           // Red channel
        1.0 - tint * 0.5,           // Green channel
        1.0 - temp * 0.5            // Blue channel
    );
    return rgb * shift;
}

// Soft tonal weight for range-aware adjustments
// Uses smooth hermite curves for natural transitions
float shadowWeight(float luma) {
    // Shadows affect primarily dark areas with smooth rolloff
    return 1.0 - smoothstep(0.0, 0.5, luma);
}

float highlightWeight(float luma) {
    // Highlights affect primarily bright areas
    return smoothstep(0.5, 1.0, luma);
}

float midtoneWeight(float luma) {
    // Midtones peak at 0.5 with falloff at extremes
    return 1.0 - abs(luma - 0.5) * 2.0;
}

float whitesWeight(float luma) {
    // Whites: top end only
    return smoothstep(0.7, 1.0, luma);
}

float blacksWeight(float luma) {
    // Blacks: bottom end only
    return 1.0 - smoothstep(0.0, 0.3, luma);
}

// Apply tonal range adjustments without hue skew
// Operates on luminance then reconstructs color
vec3 applyTonalRanges(vec3 rgb, float highlights, float shadows, float whites, float blacks) {
    float luma = dot(rgb, LUMA_WEIGHTS);
    vec3 chroma = rgb - luma;
    
    // Compute adjustments based on luma position
    float hWeight = highlightWeight(luma);
    float sWeight = shadowWeight(luma);
    float wWeight = whitesWeight(luma);
    float bWeight = blacksWeight(luma);
    
    // Apply adjustments to luma (multiplicative for natural behavior)
    float lumaAdjust = 0.0;
    lumaAdjust += highlights * hWeight * 0.5;  // Scale factor for usable range
    lumaAdjust += shadows * sWeight * 0.5;
    lumaAdjust += whites * wWeight * 0.3;
    lumaAdjust += blacks * bWeight * 0.3;
    
    float newLuma = luma + lumaAdjust;
    newLuma = max(newLuma, 0.0);
    
    // Reconstruct with preserved chroma
    return newLuma + chroma;
}

// S-curve contrast
vec3 applyContrast(vec3 rgb, float contrast) {
    if (abs(contrast) < 0.001) return rgb;
    
    float luma = dot(rgb, LUMA_WEIGHTS);
    vec3 chroma = rgb - luma;
    
    // S-curve using adjusted sigmoid
    // Contrast > 0: steepen curve, Contrast < 0: flatten
    float pivot = 0.5;
    float factor = 1.0 + contrast;
    
    // Apply curve per-channel to preserve color but weight toward luma
    float newLuma = (luma - pivot) * factor + pivot;
    newLuma = clamp(newLuma, 0.0, 1.5); // Allow some headroom
    
    return newLuma + chroma;
}

// Apply lift/gamma/gain style curve
vec3 applyCurve(vec3 rgb, float shadowLift, float midGamma, float highGain) {
    float luma = dot(rgb, LUMA_WEIGHTS);
    vec3 chroma = rgb - luma;
    
    // Compute blended adjustment
    float sW = shadowWeight(luma);
    float mW = midtoneWeight(luma);
    float hW = highlightWeight(luma);
    
    // Lift (add to shadows), Gamma (power curve on mids), Gain (multiply highlights)
    float lift = shadowLift * sW * 0.2;
    float gamma = 1.0 - midGamma * mW * 0.3;
    float gain = 1.0 + highGain * hW * 0.5;
    
    float newLuma = luma + lift;
    newLuma = pow(max(newLuma, 0.001), gamma);
    newLuma = newLuma * gain;
    
    return max(newLuma + chroma, vec3(0.0));
}

// Saturation adjustment (uniform scaling of chroma)
vec3 applySaturation(vec3 rgb, float satAmount) {
    float luma = dot(rgb, LUMA_WEIGHTS);
    vec3 chroma = rgb - luma;
    return luma + chroma * satAmount;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Decode to linear (assume input is sRGB)
    vec3 rgb = srgbToLinear(color.rgb);
    
    // 1. White Balance
    rgb = applyWhiteBalance(rgb, temperature, tint);
    
    // 2. Exposure (in linear = multiply by 2^exposure)
    rgb = rgb * pow(2.0, exposure);
    
    // 3. Contrast (S-curve)
    rgb = applyContrast(rgb, contrast);
    
    // 4. Tonal Range Operators
    rgb = applyTonalRanges(rgb, highlights, shadows, whites, blacks);
    
    // 5. Curves (lift/gamma/gain)
    rgb = applyCurve(rgb, curveShadows, curveMidtones, curveHighlights);
    
    // 6. Saturation
    rgb = applySaturation(rgb, saturation);
    
    // Encode back to sRGB for next pass
    rgb = linearToSrgb(max(rgb, vec3(0.0)));
    
    fragColor = vec4(rgb, color.a);
}
