#version 300 es

precision highp float;
precision highp int;

// Outline value map pass - convert input to luminance for edge detection

uniform sampler2D inputTex;

out vec4 fragColor;

float srgbToLinear(float value) {
    return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4);
}

vec3 srgbToLinear(vec3 value) {
    return vec3(srgbToLinear(value.r), srgbToLinear(value.g), srgbToLinear(value.b));
}

float cubeRoot(float value) {
    return value < 0.0 ? -pow(-value, 1.0 / 3.0) : pow(value, 1.0 / 3.0);
}

float oklabLComponent(vec3 rgb) {
    vec3 linear = srgbToLinear(clamp(rgb, vec3(0.0), vec3(1.0)));
    float l = 0.4121656120 * linear.r + 0.5362752080 * linear.g + 0.0514575653 * linear.b;
    float m = 0.2118591070 * linear.r + 0.6807189584 * linear.g + 0.1074065790 * linear.b;
    float s = 0.0883097947 * linear.r + 0.2818474174 * linear.g + 0.6302613616 * linear.b;
    float lC = cubeRoot(max(l, 1e-9));
    float mC = cubeRoot(max(m, 1e-9));
    float sC = cubeRoot(max(s, 1e-9));
    return clamp(0.2104542553 * lC + 0.7936177850 * mC - 0.0040720468 * sC, 0.0, 1.0);
}

float valueMapComponent(vec4 texel) {
    float spread = max(abs(texel.r - texel.g), max(abs(texel.r - texel.b), abs(texel.g - texel.b)));
    if (spread < 1e-5) {
        return clamp(texel.r, 0.0, 1.0);
    }
    return oklabLComponent(texel.rgb);
}

void main() {
    ivec2 dimensions = textureSize(inputTex, 0);
    vec2 uv = (gl_FragCoord.xy - vec2(0.5)) / vec2(max(dimensions.x, 1), max(dimensions.y, 1));
    vec4 texel = texture(inputTex, uv);
    float value = valueMapComponent(texel);
    fragColor = vec4(value, value, value, texel.a);
}
