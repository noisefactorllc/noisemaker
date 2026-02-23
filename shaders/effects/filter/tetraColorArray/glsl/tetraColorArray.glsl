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

// --- RGB <-> HSV ---

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

vec3 rgb2hsv(vec3 c) {
    float cmax = max(c.r, max(c.g, c.b));
    float cmin = min(c.r, min(c.g, c.b));
    float delta = cmax - cmin;

    float h = 0.0;
    if (delta > 0.0) {
        if (cmax == c.r) h = mod((c.g - c.b) / delta, 6.0) / 6.0;
        else if (cmax == c.g) h = ((c.b - c.r) / delta + 2.0) / 6.0;
        else h = ((c.r - c.g) / delta + 4.0) / 6.0;
    }
    float s = (cmax > 0.0) ? delta / cmax : 0.0;
    return vec3(h, s, cmax);
}

// --- Gamma transfer ---

vec3 linear2srgb(vec3 lin) {
    vec3 low = lin * 12.92;
    vec3 high = 1.055 * pow(max(lin, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(high, low, step(lin, vec3(0.0031308)));
}

vec3 srgb2linear(vec3 c) {
    vec3 low = c / 12.92;
    vec3 high = pow((c + 0.055) / 1.055, vec3(2.4));
    return mix(high, low, step(c, vec3(0.04045)));
}

// --- OkLab core ---

vec3 oklab2linear(vec3 lab) {
    float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    return vec3(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

vec3 linear2oklab(vec3 lin) {
    float l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
    float m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
    float s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

    float l_ = pow(max(l, 0.0), 1.0 / 3.0);
    float m_ = pow(max(m, 0.0), 1.0 / 3.0);
    float s_ = pow(max(s, 0.0), 1.0 / 3.0);

    return vec3(
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    );
}

// --- RGB <-> OkLab ---

vec3 oklab2rgb(vec3 lab) {
    return clamp(linear2srgb(oklab2linear(lab)), 0.0, 1.0);
}

vec3 rgb2oklab(vec3 rgb) {
    return linear2oklab(srgb2linear(rgb));
}

// --- RGB <-> OKLCH (L, C, H where H is 0-1 fractional turns) ---

vec3 oklch2rgb(vec3 lch) {
    float a = lch.y * cos(lch.z * TAU);
    float b = lch.y * sin(lch.z * TAU);
    return clamp(linear2srgb(oklab2linear(vec3(lch.x, a, b))), 0.0, 1.0);
}

vec3 rgb2oklch(vec3 rgb) {
    vec3 lab = rgb2oklab(rgb);
    float C = length(lab.yz);
    float h = atan(lab.z, lab.y);
    return vec3(lab.x, C, fract(h / TAU));
}

// --- Dispatch by mode ---

vec3 rgbToColorSpace(vec3 rgb, int mode) {
    if (mode == 1) return rgb2hsv(rgb);
    if (mode == 2) return rgb2oklab(rgb);
    if (mode == 3) return rgb2oklch(rgb);
    return rgb;
}

vec3 colorSpaceToRgb(vec3 color, int mode) {
    if (mode == 1) return hsv2rgb(color);
    if (mode == 2) return oklab2rgb(color);
    if (mode == 3) return oklch2rgb(color);
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

// Interpolate in color space with shortest-path hue for HSV/OKLCH
vec3 mixInColorSpace(vec3 a, vec3 b, float f, int mode) {
    if (mode == 1) {
        // HSV: hue is .x
        float dh = b.x - a.x;
        if (dh > 0.5) dh -= 1.0;
        if (dh < -0.5) dh += 1.0;
        return vec3(fract(a.x + dh * f), mix(a.y, b.y, f), mix(a.z, b.z, f));
    } else if (mode == 3) {
        // OKLCH: hue is .z
        float dh = b.z - a.z;
        if (dh > 0.5) dh -= 1.0;
        if (dh < -0.5) dh += 1.0;
        return vec3(mix(a.x, b.x, f), mix(a.y, b.y, f), fract(a.z + dh * f));
    }
    return mix(a, b, f);
}

vec3 sampleColorArray(float t, int count, float smoothAmount) {
    t = clamp(t, 0.0, 1.0);
    int mode = tetraColorArrayColorMode;

    // Cascade blend: smoothstep at each transition boundary
    vec3 result = rgbToColorSpace(getColor(0), mode);

    for (int i = 1; i < count; i++) {
        float boundary, bw;

        if (tetraColorArrayPositionMode == 0) {
            // Auto: equal-width bands, transitions at i/count
            boundary = float(i) / float(count);
            bw = smoothAmount * 0.5 / float(count);
        } else {
            // Manual: transition at midpoint between adjacent positions
            float pPrev = getPosition(i - 1, count);
            float pCurr = getPosition(i, count);
            boundary = (pPrev + pCurr) * 0.5;
            bw = smoothAmount * (pCurr - pPrev) * 0.25;
        }

        float blend = smoothstep(boundary - bw, boundary + bw, t);
        vec3 nextColor = rgbToColorSpace(getColor(i), mode);
        result = mixInColorSpace(result, nextColor, blend, mode);
    }

    return colorSpaceToRgb(result, mode);
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
    float t = fract(lum * (1.0 - 1e-4) * tetraColorArrayRepeat + tetraColorArrayOffset);

    // Sample the color array gradient
    vec3 gradientColor = sampleColorArray(t, tetraColorArrayColorCount, tetraColorArraySmoothness);

    // Blend with original based on alpha
    vec3 blendedColor = mix(inputColor.rgb, gradientColor, tetraColorArrayAlpha);

    fragColor = vec4(blendedColor, inputColor.a);
}
