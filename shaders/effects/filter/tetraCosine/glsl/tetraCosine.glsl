/**
 * Tetra Cosine Gradient - GLSL Fragment Shader
 *
 * Applies a cosine palette to the input image based on luminance.
 * Uses the Inigo Quilez cosine palette formula:
 *   color(t) = offset + amp * cos(2π * (freq * t + phase))
 *
 * Supports RGB, HSV, OkLab, and OKLCH color modes.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;

// Color mode: 0=RGB, 1=HSV, 2=OkLab, 3=OKLCH
uniform int tetraCosineColorMode;

// Cosine palette parameters
uniform float tetraCosineOffsetR;
uniform float tetraCosineOffsetG;
uniform float tetraCosineOffsetB;
uniform float tetraCosineAmpR;
uniform float tetraCosineAmpG;
uniform float tetraCosineAmpB;
uniform float tetraCosineFreqR;
uniform float tetraCosineFreqG;
uniform float tetraCosineFreqB;
uniform float tetraCosinePhaseR;
uniform float tetraCosinePhaseG;
uniform float tetraCosinePhaseB;

// Mapping controls
uniform float tetraCosineRepeat;
uniform float tetraCosineOffset;
uniform float tetraCosineAlpha;

out vec4 fragColor;

const float TAU = 6.283185307179586;

// ============================================================================
// Color Space Conversions
// ============================================================================

// HSV to RGB
vec3 hsv2rgb(vec3 hsv) {
    float h = hsv.x;
    float s = hsv.y;
    float v = hsv.z;

    float c = v * s;
    float hp = h * 6.0;
    float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
    float m = v - c;

    vec3 rgb;
    if (hp < 1.0) {
        rgb = vec3(c, x, 0.0);
    } else if (hp < 2.0) {
        rgb = vec3(x, c, 0.0);
    } else if (hp < 3.0) {
        rgb = vec3(0.0, c, x);
    } else if (hp < 4.0) {
        rgb = vec3(0.0, x, c);
    } else if (hp < 5.0) {
        rgb = vec3(x, 0.0, c);
    } else {
        rgb = vec3(c, 0.0, x);
    }

    return rgb + vec3(m);
}

// OkLab to linear RGB
vec3 oklab2linear(vec3 lab) {
    float L = lab.x;
    float a = lab.y;
    float b = lab.z;

    float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    return vec3(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

// Linear to sRGB gamma
vec3 linear2srgb(vec3 linear) {
    vec3 low = linear * 12.92;
    vec3 high = 1.055 * pow(max(linear, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, step(linear, vec3(0.0031308)));
}

// OkLab to sRGB (cosine output is 0-1, a/b need remapping from 0-1 to -0.4..0.4)
vec3 oklab2rgb(vec3 lab) {
    // Remap a, b from 0-1 storage format to actual -0.4 to 0.4 range
    float L = lab.x;
    float a = (lab.y - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4
    float b = (lab.z - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4

    vec3 linear_rgb = oklab2linear(vec3(L, a, b));
    return clamp(linear2srgb(linear_rgb), 0.0, 1.0);
}

// OKLCH to sRGB (cosine output is L 0-1, C 0-1 representing 0-0.4, H 0-1)
vec3 oklch2rgb(vec3 lch) {
    float L = lch.x;
    float C = lch.y * 0.4;  // 0-1 → 0 to 0.4
    float H = lch.z * TAU;  // 0-1 → 0 to 2π

    // Convert cylindrical to cartesian (OkLab)
    float a = C * cos(H);
    float b = C * sin(H);

    vec3 linear_rgb = oklab2linear(vec3(L, a, b));
    return clamp(linear2srgb(linear_rgb), 0.0, 1.0);
}

// ============================================================================
// Cosine Palette
// ============================================================================

vec3 cosinePalette(float t, vec3 offset, vec3 amp, vec3 freq, vec3 phase) {
    return clamp(offset + amp * cos(TAU * (freq * t + phase)), 0.0, 1.0);
}

void main() {
    // Calculate UV from gl_FragCoord
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 uv = gl_FragCoord.xy / texSize;

    // Get input color
    vec4 inputColor = texture(inputTex, uv);

    // Calculate luminance as the t value
    float lum = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));

    // Apply mapping: repeat and offset
    float t = fract(lum * tetraCosineRepeat + tetraCosineOffset);

    // Build palette parameters from uniforms
    vec3 offset = vec3(tetraCosineOffsetR, tetraCosineOffsetG, tetraCosineOffsetB);
    vec3 amp = vec3(tetraCosineAmpR, tetraCosineAmpG, tetraCosineAmpB);
    vec3 freq = vec3(tetraCosineFreqR, tetraCosineFreqG, tetraCosineFreqB);
    vec3 phase = vec3(tetraCosinePhaseR, tetraCosinePhaseG, tetraCosinePhaseB);

    // Evaluate cosine palette
    vec3 paletteColor = cosinePalette(t, offset, amp, freq, phase);

    // Convert from color mode to RGB
    vec3 finalColor;
    if (tetraCosineColorMode == 1) {
        // HSV mode
        finalColor = hsv2rgb(paletteColor);
    } else if (tetraCosineColorMode == 2) {
        // OkLab mode
        finalColor = oklab2rgb(paletteColor);
    } else if (tetraCosineColorMode == 3) {
        // OKLCH mode
        finalColor = oklch2rgb(paletteColor);
    } else {
        // RGB mode (default)
        finalColor = paletteColor;
    }

    // Blend with original based on alpha
    vec3 blendedColor = mix(inputColor.rgb, finalColor, tetraCosineAlpha);

    fragColor = vec4(blendedColor, inputColor.a);
}
