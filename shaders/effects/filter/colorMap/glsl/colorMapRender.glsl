#version 300 es
precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform sampler2D statsTex;
uniform vec2 resolution;
uniform float displacement;
uniform float horizontal;

out vec4 fragColor;

const uint CHANNEL_COUNT = 4u;
const float EPSILON = 1e-6;

uint as_u32(float value) {
    return uint(max(round(value), 0.0));
}

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

uint sanitized_channelCount(float channel_value) {
    int rounded = int(round(channel_value));
    if (rounded <= 1) {
        return 1u;
    }
    if (rounded >= int(CHANNEL_COUNT)) {
        return CHANNEL_COUNT;
    }
    return uint(rounded);
}

int wrap_coord(int value, int extent) {
    if (extent <= 0) {
        return 0;
    }
    int wrapped = value % extent;
    if (wrapped < 0) {
        wrapped = wrapped + extent;
    }
    return wrapped;
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
    float r = srgb_to_linear(clamp01(rgb.x));
    float g = srgb_to_linear(clamp01(rgb.y));
    float b = srgb_to_linear(clamp01(rgb.z));

    float l = 0.4121656120 * r + 0.5362752080 * g + 0.0514575653 * b;
    float m = 0.2118591070 * r + 0.6807189584 * g + 0.1074065790 * b;
    float s = 0.0883097947 * r + 0.2818474174 * g + 0.6302613616 * b;

    float l_c = cube_root(l);
    float m_c = cube_root(m);
    float s_c = cube_root(s);

    return 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
}

float value_map_component(vec4 texel, uint channelCount) {
    if (channelCount <= 2u) {
        return texel.x;
    }
    return oklab_l_component(vec3(texel.x, texel.y, texel.z));
}

void main() {
    uint width = as_u32(resolution.x);
    uint height = as_u32(resolution.y);
    
    if (gl_FragCoord.x >= float(width) || gl_FragCoord.y >= float(height)) {
        fragColor = vec4(0.0);
        return;
    }

    uint channelCount = 4u;
    float displacementValue = displacement;
    bool isHorizontal = horizontal >= 0.5;

    // Read stats from (0,0) of statsTex
    vec4 stats = texelFetch(statsTex, ivec2(0, 0), 0);
    float min_value = stats.r;
    float max_value = stats.g;

    if (min_value > max_value) {
        min_value = 0.0;
        max_value = 0.0;
    }

    float range = max_value - min_value;
    bool has_range = abs(range) > EPSILON;

    vec2 coord = floor(gl_FragCoord.xy);
    vec4 texel = texelFetch(inputTex, ivec2(coord), 0);
    float reference_raw = value_map_component(texel, channelCount);

    float normalized = reference_raw;
    if (has_range) {
        normalized = (reference_raw - min_value) / range;
    }

    float reference = normalized * displacementValue;

    int width_i = int(width);
    int height_i = int(height);
    float max_x_offset = float(max(width_i - 1, 0));
    float max_y_offset = float(max(height_i - 1, 0));

    int offset_x = int(reference * max_x_offset);
    int offset_y = 0;
    if (!isHorizontal) {
        offset_y = int(reference * max_y_offset);
    }

    int sample_x = wrap_coord(int(coord.x) + offset_x, width_i);
    int sample_y = int(coord.y);
    if (!isHorizontal) {
        sample_y = wrap_coord(int(coord.y) + offset_y, height_i);
    }

    vec4 clut_sample = texelFetch(tex, ivec2(sample_x, sample_y), 0);
    if (clut_sample.a == 0.0) {
        fragColor = texel;
    } else {
        fragColor = clut_sample;
    }
}