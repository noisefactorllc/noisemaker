#version 300 es

precision highp float;
precision highp int;

// Reindex Pass 1 (Stats): compute lightness range per 8x8 tile.

const float F32_MAX = 3.402823466e38;
const float F32_MIN = -3.402823466e38;
const int TILE_SIZE = 8;

uniform sampler2D inputTex;

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

void main() {
    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    int localX = fragCoord.x % TILE_SIZE;
    int localY = fragCoord.y % TILE_SIZE;

    // Only the tile anchor (top-left pixel of the tile) performs the reduction.
    if (localX != 0 || localY != 0) {
        fragColor = vec4(0.0);
        return;
    }

    ivec2 texSize = textureSize(inputTex, 0);
    ivec2 tileOrigin = fragCoord;

    float minValue = F32_MAX;
    float maxValue = F32_MIN;

    for (int oy = 0; oy < TILE_SIZE; ++oy) {
        int py = tileOrigin.y + oy;
        if (py >= texSize.y) break;
        for (int ox = 0; ox < TILE_SIZE; ++ox) {
            int px = tileOrigin.x + ox;
            if (px >= texSize.x) break;
            vec4 texel = texelFetch(inputTex, ivec2(px, py), 0);
            float value = value_map_component(texel);
            minValue = min(minValue, value);
            maxValue = max(maxValue, value);
        }
    }

    fragColor = vec4(minValue, maxValue, 0.0, 1.0);
}