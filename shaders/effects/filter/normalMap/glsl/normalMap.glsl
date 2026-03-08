#version 300 es
precision highp float;
precision highp int;

const uint CHANNEL_COUNT = 4u;
const uint CHANNEL_CAP = 4u;

uniform sampler2D inputTex;
uniform vec4 size;
uniform vec4 motion;

layout(location = 0) out vec4 fragColor;

const ivec2 SOBEL_OFFSETS[9] = ivec2[](
    ivec2(-1, -1), ivec2(0, -1), ivec2(1, -1),
    ivec2(-1,  0), ivec2(0,  0), ivec2(1,  0),
    ivec2(-1,  1), ivec2(0,  1), ivec2(1,  1)
);

const float SOBEL_X_KERNEL[9] = float[](
    0.5, 0.0, -0.5,
    1.0, 0.0, -1.0,
    0.5, 0.0, -0.5
);

const float SOBEL_Y_KERNEL[9] = float[](
    0.5, 1.0, 0.5,
    0.0, 0.0, 0.0,
   -0.5, -1.0, -0.5
);

uint as_u32(float value) {
    return uint(max(round(value), 0.0));
}

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

uint sanitize_channelCount(float raw_value) {
    uint count = as_u32(raw_value);
    if (count <= 1u) {
        return 1u;
    }
    if (count >= CHANNEL_CAP) {
        return CHANNEL_CAP;
    }
    return count;
}

int wrap_coord(int value, int limit) {
    if (limit <= 0) {
        return 0;
    }
    int wrapped = value % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

float srgb_to_linear(float value) {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

float cbrt_safe(float value) {
    if (value == 0.0) {
        return 0.0;
    }
    float sign_value = (value >= 0.0) ? 1.0 : -1.0;
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

float oklab_l_component(vec3 rgb) {
    float r = srgb_to_linear(clamp01(rgb.x));
    float g = srgb_to_linear(clamp01(rgb.y));
    float b = srgb_to_linear(clamp01(rgb.z));

    float l = 0.4121656120 * r + 0.5362752080 * g + 0.0514575653 * b;
    float m = 0.2118591070 * r + 0.6807189584 * g + 0.1074065790 * b;
    float s = 0.0883097947 * r + 0.2818474174 * g + 0.6302613616 * b;

    float l_c = cbrt_safe(l);
    float m_c = cbrt_safe(m);
    float s_c = cbrt_safe(s);

    return clamp01(0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c);
}

float value_map_component(vec4 texel, uint channelCount) {
    if (channelCount <= 1u) {
        return texel.x;
    }
    if (channelCount == 2u) {
        return texel.x;
    }
    if (channelCount == 3u) {
        return oklab_l_component(texel.xyz);
    }
    vec3 clamped_rgb = clamp(texel.xyz, vec3(0.0), vec3(1.0));
    return oklab_l_component(clamped_rgb);
}

float compute_reference_value(ivec2 coords, uint channelCount) {
    vec4 texel = texelFetch(inputTex, coords, 0);
    return value_map_component(texel, channelCount);
}

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint width = as_u32(size.x);
    uint height = as_u32(size.y);
    ivec2 dims = textureSize(inputTex, 0);
    if (width == 0u) {
        width = uint(max(dims.x, 1));
    }
    if (height == 0u) {
        height = uint(max(dims.y, 1));
    }
    if (global_id.x >= width || global_id.y >= height) {
        return;
    }

    uint channelCount = sanitize_channelCount(size.z);
    int width_i = int(width);
    int height_i = int(height);

    float dx = 0.0;
    float dy = 0.0;

    for (int i = 0; i < 9; i++) {
        ivec2 offset = SOBEL_OFFSETS[i];
        ivec2 sample_coord = ivec2(
            wrap_coord(int(global_id.x) + offset.x, width_i),
            wrap_coord(int(global_id.y) + offset.y, height_i)
        );
        float value = compute_reference_value(sample_coord, channelCount);
        dx += value * SOBEL_X_KERNEL[i];
        dy += value * SOBEL_Y_KERNEL[i];
    }

    float x_value = clamp(dx * 0.5 + 0.5, 0.0, 1.0);
    float y_value = clamp(dy * 0.5 + 0.5, 0.0, 1.0);
    float z_value = clamp(1.0 - (abs(dx) + abs(dy)) * 0.5, 0.0, 1.0);

    vec4 texel = texelFetch(inputTex, ivec2(global_id.xy), 0);
    fragColor = vec4(x_value, y_value, z_value, texel.w);
}
