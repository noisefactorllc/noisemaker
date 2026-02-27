/*
 * Grade - Three-Way Color Wheels Pass
 * Shadows/Midtones/Highlights color balance
 * Classic 3-way corrector with separate chroma moves per tonal range
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec3 wheelShadows;
uniform vec3 wheelMidtones;
uniform vec3 wheelHighlights;
uniform float wheelBalance;

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

// Tonal range weights with adjustable balance
float shadowWeight(float luma, float balance) {
    float boundary = 0.33 - balance * 0.15;
    return 1.0 - smoothstep(0.0, boundary * 2.0, luma);
}

float midtoneWeight(float luma, float balance) {
    float center = 0.5;
    float spread = 0.4 - abs(balance) * 0.1;
    float dist = abs(luma - center) / spread;
    return max(0.0, 1.0 - dist);
}

float highlightWeight(float luma, float balance) {
    float boundary = 0.67 + balance * 0.15;
    return smoothstep(boundary - 0.33, 1.0, luma);
}

// Apply color wheel adjustment
// Wheel values are 0.5 = neutral, deviation from 0.5 = color push
vec3 applyWheels(vec3 rgb, vec3 shadowWheel, vec3 midWheel, vec3 highWheel, float balance) {
    // Convert wheel positions to color offsets
    vec3 shadowOffset = (shadowWheel - 0.5) * 2.0;
    vec3 midOffset = (midWheel - 0.5) * 2.0;
    vec3 highOffset = (highWheel - 0.5) * 2.0;
    
    // Skip if all neutral
    if (length(shadowOffset) < 0.01 && length(midOffset) < 0.01 && length(highOffset) < 0.01) {
        return rgb;
    }
    
    float luma = dot(rgb, LUMA_WEIGHTS);
    
    // Compute tonal weights
    float sW = shadowWeight(luma, balance);
    float mW = midtoneWeight(luma, balance);
    float hW = highlightWeight(luma, balance);
    
    // Normalize weights so they sum to ~1 for smooth blending
    float totalWeight = sW + mW + hW + 0.001;
    sW /= totalWeight;
    mW /= totalWeight;
    hW /= totalWeight;
    
    // Apply weighted color offsets
    vec3 colorShift = vec3(0.0);
    colorShift += shadowOffset * sW * 0.5;
    colorShift += midOffset * mW * 0.5;
    colorShift += highOffset * hW * 0.5;
    
    // Add shift while preserving luminance structure
    vec3 result = rgb + colorShift;
    
    // Gentle luma preservation (optional, reduces color wash)
    float newLuma = dot(result, LUMA_WEIGHTS);
    float lumaDiff = luma - newLuma;
    result += lumaDiff * 0.3;
    
    return result;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Decode to linear
    vec3 rgb = srgbToLinear(color.rgb);
    
    // Apply three-way color wheels
    rgb = applyWheels(rgb, wheelShadows, wheelMidtones, wheelHighlights, wheelBalance);
    
    // Encode back to sRGB
    rgb = linearToSrgb(max(rgb, vec3(0.0)));
    
    fragColor = vec4(rgb, color.a);
}
