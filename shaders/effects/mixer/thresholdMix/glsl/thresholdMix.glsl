/*
 * ThresholdMix mixer shader
 * Combines two input textures using threshold masking with optional posterization
 * Supports luminance-based or per-channel RGB thresholding
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int mode;
uniform int quantize;
uniform int mapSource;
uniform float threshold;
uniform float range;
uniform float thresholdR;
uniform float rangeR;
uniform float thresholdG;
uniform float rangeG;
uniform float thresholdB;
uniform float rangeB;

out vec4 fragColor;

// Convert RGB to luminosity
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// Quantize a value into discrete bands
float quantizeValue(float value, int bands) {
    if (bands <= 0) return value;
    float numBands = float(bands);
    return floor(value * numBands) / numBands;
}

// Calculate blend factor with threshold and range
// Returns 0 for values below threshold, 1 for values above threshold+range
// Smooth transition in between
float calculateBlendFactor(float mapValue, float thresh, float rng) {
    if (rng <= 0.0) {
        // Hard threshold
        return step(thresh, mapValue);
    } else {
        // Soft threshold with range
        float lower = thresh;
        float upper = thresh + rng;
        return smoothstep(lower, upper, mapValue);
    }
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, uv);
    vec4 colorB = texture(tex, uv);
    
    // Get map color based on mapSource
    vec3 mapColor;
    if (mapSource == 0) {
        mapColor = colorA.rgb;
    } else {
        mapColor = colorB.rgb;
    }
    
    // Apply quantization to map values if enabled
    if (quantize > 0) {
        mapColor.r = quantizeValue(mapColor.r, quantize);
        mapColor.g = quantizeValue(mapColor.g, quantize);
        mapColor.b = quantizeValue(mapColor.b, quantize);
    }
    
    vec4 result;
    
    if (mode == 0) {
        // Luminance mode - use single threshold for all channels
        float lum = getLuminosity(mapColor);
        float blendFactor = calculateBlendFactor(lum, threshold, range);
        result = mix(colorA, colorB, blendFactor);
    } else {
        // RGB mode - use separate threshold for each channel
        float blendR = calculateBlendFactor(mapColor.r, thresholdR, rangeR);
        float blendG = calculateBlendFactor(mapColor.g, thresholdG, rangeG);
        float blendB = calculateBlendFactor(mapColor.b, thresholdB, rangeB);
        
        result.r = mix(colorA.r, colorB.r, blendR);
        result.g = mix(colorA.g, colorB.g, blendG);
        result.b = mix(colorA.b, colorB.b, blendB);
        result.a = mix(colorA.a, colorB.a, (blendR + blendG + blendB) / 3.0);
    }
    
    fragColor = result;
}
