/*
 * Combined color adjustment effect
 * Colorspace reinterpretation + hue/saturation + brightness/contrast
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int mode;        // 0: off, 1: HSV, 2: OKLab, 3: OKLCH
uniform float rotation;
uniform float hueRange;
uniform float saturation;
uniform float brightness;
uniform float contrast;

out vec4 fragColor;

const float TAU = 6.28318530718;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// --- Colorspace functions ---

vec3 hsv2rgb(vec3 hsv) {
    float h = fract(hsv.x);
    float s = hsv.y;
    float v = hsv.z;
    float c = v * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;
    vec3 rgb;
    if (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb + m;
}

vec3 rgb2hsv(vec3 rgb) {
    float r = rgb.r, g = rgb.g, b = rgb.b;
    float maxC = max(r, max(g, b));
    float minC = min(r, min(g, b));
    float delta = maxC - minC;

    float h = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = mod((g - b) / delta, 6.0) / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    float s = (maxC == 0.0) ? 0.0 : delta / maxC;
    return vec3(h, s, maxC);
}

// OKLab to linear sRGB matrices
const mat3 fwdA = mat3(1.0, 1.0, 1.0,
                       0.3963377774, -0.1055613458, -0.0894841775,
                       0.2158037573, -0.0638541728, -1.2914855480);

const mat3 fwdB = mat3(4.0767245293, -1.2681437731, -0.0041119885,
                       -3.3072168827, 2.6093323231, -0.7034763098,
                       0.2307590544, -0.3411344290, 1.7068625689);

vec3 linear_srgb_from_oklab(vec3 c) {
    vec3 lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; ++i) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    // --- Colorspace reinterpretation ---
    if (mode == 1) {
        // HSV
        color.rgb = hsv2rgb(color.rgb);
    } else if (mode == 2) {
        // OKLab
        color.g = color.g * -0.509 + 0.276;
        color.b = color.b * -0.509 + 0.198;
        color.rgb = linear_srgb_from_oklab(color.rgb);
        color.rgb = linearToSrgb(color.rgb);
    } else if (mode == 3) {
        // OKLCH - interpret RGB as L, C, H
        float L = color.r;
        float C = color.g * 0.4;
        float H = color.b * TAU;
        float a = C * cos(H);
        float b = C * sin(H);
        color.rgb = linear_srgb_from_oklab(vec3(L, a, b));
        color.rgb = linearToSrgb(color.rgb);
    }

    // --- Hue / Saturation ---
    vec3 hsv = rgb2hsv(color.rgb);
    hsv.x = fract(hsv.x * map(hueRange, 0.0, 200.0, 0.0, 2.0) + (rotation / 360.0));
    hsv.y *= saturation;
    color.rgb = hsv2rgb(hsv);

    // --- Brightness / Contrast ---
    color.rgb *= brightness;
    float contrastFactor = contrast * 2.0;
    color.rgb = (color.rgb - 0.5) * contrastFactor + 0.5;

    fragColor = color;
}
