/**
 * Tetra Color Array Gradient - GLSL Fragment Shader
 *
 * Applies a discrete color gradient to the input image based on luminance.
 * Interpolates between 2-8 colors with optional custom positions.
 *
 * Supports RGB, HSV, OkLab, and OKLCH color modes.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;

// Color mode: 0=RGB, 1=HSV, 2=OkLab, 3=OKLCH
uniform int tetraColorArrayColorMode;

// Color count (2-8)
uniform int tetraColorArrayColorCount;

// Position mode: 0=auto, 1=manual
uniform int tetraColorArrayPositionMode;

// Colors (up to 8)
uniform vec3 tetraColorArrayColor0;
uniform vec3 tetraColorArrayColor1;
uniform vec3 tetraColorArrayColor2;
uniform vec3 tetraColorArrayColor3;
uniform vec3 tetraColorArrayColor4;
uniform vec3 tetraColorArrayColor5;
uniform vec3 tetraColorArrayColor6;
uniform vec3 tetraColorArrayColor7;

// Positions (for manual mode)
uniform float tetraColorArrayPos0;
uniform float tetraColorArrayPos1;
uniform float tetraColorArrayPos2;
uniform float tetraColorArrayPos3;
uniform float tetraColorArrayPos4;
uniform float tetraColorArrayPos5;
uniform float tetraColorArrayPos6;
uniform float tetraColorArrayPos7;

// Mapping controls
uniform float tetraColorArrayRepeat;
uniform float tetraColorArrayOffset;
uniform float tetraColorArraySmoothness;
uniform float tetraColorArrayAlpha;

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

// OkLab to sRGB (values stored as 0-1, a/b need remapping)
vec3 oklab2rgb(vec3 lab) {
    float L = lab.x;
    float a = (lab.y - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4
    float b = (lab.z - 0.5) * 0.8;

    vec3 linear_rgb = oklab2linear(vec3(L, a, b));
    return clamp(linear2srgb(linear_rgb), 0.0, 1.0);
}

// OKLCH to sRGB (L 0-1, C stored as 0-1, H 0-1)
vec3 oklch2rgb(vec3 lch) {
    float L = lch.x;
    float C = lch.y * 0.4;  // 0-1 → 0 to 0.4
    float H = lch.z * TAU;  // 0-1 → 0 to 2π

    float a = C * cos(H);
    float b = C * sin(H);

    vec3 linear_rgb = oklab2linear(vec3(L, a, b));
    return clamp(linear2srgb(linear_rgb), 0.0, 1.0);
}

// Convert color from current mode to RGB
vec3 colorToRgb(vec3 color, int mode) {
    if (mode == 1) {
        return hsv2rgb(color);
    } else if (mode == 2) {
        return oklab2rgb(color);
    } else if (mode == 3) {
        return oklch2rgb(color);
    }
    return color;
}

// ============================================================================
// Color Array Interpolation
// ============================================================================

vec3 getColor(int index) {
    if (index == 0) return tetraColorArrayColor0;
    if (index == 1) return tetraColorArrayColor1;
    if (index == 2) return tetraColorArrayColor2;
    if (index == 3) return tetraColorArrayColor3;
    if (index == 4) return tetraColorArrayColor4;
    if (index == 5) return tetraColorArrayColor5;
    if (index == 6) return tetraColorArrayColor6;
    return tetraColorArrayColor7;
}

float getPosition(int index, int count) {
    if (tetraColorArrayPositionMode == 0) {
        // Auto mode: even spacing
        return float(index) / float(count - 1);
    }
    // Manual mode: use position uniforms
    if (index == 0) return tetraColorArrayPos0;
    if (index == 1) return tetraColorArrayPos1;
    if (index == 2) return tetraColorArrayPos2;
    if (index == 3) return tetraColorArrayPos3;
    if (index == 4) return tetraColorArrayPos4;
    if (index == 5) return tetraColorArrayPos5;
    if (index == 6) return tetraColorArrayPos6;
    return tetraColorArrayPos7;
}

vec3 sampleColorArray(float t, int count, float smoothAmount) {
    t = clamp(t, 0.0, 1.0);

    // Find the segment t falls into
    for (int i = 0; i < count - 1; i++) {
        float p0 = getPosition(i, count);
        float p1 = getPosition(i + 1, count);

        if (t >= p0 && t <= p1) {
            float segmentLength = p1 - p0;
            float localT = (segmentLength > 0.0) ? (t - p0) / segmentLength : 0.0;

            // Apply smoothness to interpolation factor
            // smoothAmount=0: hard bands (step at midpoint)
            // smoothAmount=1: linear interpolation (current behavior)
            float adjustedT = mix(step(0.5, localT), localT, smoothAmount);

            vec3 c0 = getColor(i);
            vec3 c1 = getColor(i + 1);

            // Interpolate in the current color mode, then convert to RGB
            vec3 interpolated = mix(c0, c1, adjustedT);
            return colorToRgb(interpolated, tetraColorArrayColorMode);
        }
    }

    // Edge case: t is exactly at or past the last position
    return colorToRgb(getColor(count - 1), tetraColorArrayColorMode);
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
    float t = fract(lum * tetraColorArrayRepeat + tetraColorArrayOffset);

    // Sample the color array gradient
    vec3 gradientColor = sampleColorArray(t, tetraColorArrayColorCount, tetraColorArraySmoothness);

    // Blend with original based on alpha
    vec3 blendedColor = mix(inputColor.rgb, gradientColor, tetraColorArrayAlpha);

    fragColor = vec4(blendedColor, inputColor.a);
}
