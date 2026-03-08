#version 300 es

precision highp float;
precision highp int;

// Reindex Pass 3 (Apply): remap pixels using previously computed global min/max.

uniform sampler2D inputTex;
uniform sampler2D statsTex;
uniform float uDisplacement;

out vec4 fragColor;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float srgb_to_linear(float value) {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

float cube_root(float value) {
    if (value == 0.0) {
        return 0.0;
    }
    float sign_value = value >= 0.0 ? 1.0 : -1.0;
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

float oklab_l_component(vec3 rgb) {
    float r_lin = srgb_to_linear(clamp01(rgb.x));
    float g_lin = srgb_to_linear(clamp01(rgb.y));
    float b_lin = srgb_to_linear(clamp01(rgb.z));

    float l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    float m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    float s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;

    float l_c = cube_root(l);
    float m_c = cube_root(m);
    float s_c = cube_root(s);

    float lightness = 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
    return clamp01(lightness);
}

float value_map_component(vec4 texel) {
    return oklab_l_component(texel.xyz);
}

float wrap_float(float value, float range) {
    if (range <= 0.0) {
        return 0.0;
    }
    return value - range * floor(value / range);
}

int wrap_index(float value, int dimension) {
    if (dimension <= 0) {
        return 0;
    }
    float dimension_f = float(dimension);
    float wrapped = wrap_float(value, dimension_f);
    float max_index = float(dimension - 1);
    return int(clamp(floor(wrapped), 0.0, max_index));
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);

    if (pixel.x >= texSize.x || pixel.y >= texSize.y) {
        fragColor = vec4(0.0);
        return;
    }

    vec4 texel = texelFetch(inputTex, pixel, 0);
    float referenceValue = value_map_component(texel);

    vec2 minMax = texelFetch(statsTex, ivec2(0, 0), 0).xy;
    float range = minMax.y - minMax.x;

    float normalized = referenceValue;
    if (range > 0.0001) {
        normalized = clamp01((referenceValue - minMax.x) / range);
    }

    float modRange = float(min(texSize.x, texSize.y));
    float offsetValue = normalized * uDisplacement * modRange + normalized;
    int sampleX = wrap_index(offsetValue, texSize.x);
    int sampleY = wrap_index(offsetValue, texSize.y);

    vec4 sampled = texelFetch(inputTex, ivec2(sampleX, sampleY), 0);
    fragColor = sampled;
}