#version 300 es
precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;

out vec4 fragColor;

const uint CHANNEL_COUNT = 4u;

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
    if (gl_FragCoord.x >= 32.0 || gl_FragCoord.y >= 32.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    float width = resolution.x;
    float height = resolution.y;
    
    float block_w = width / 32.0;
    float block_h = height / 32.0;
    
    int start_x = int(floor(gl_FragCoord.x * block_w));
    int start_y = int(floor(gl_FragCoord.y * block_h));
    int end_x = int(floor((gl_FragCoord.x + 1.0) * block_w));
    int end_y = int(floor((gl_FragCoord.y + 1.0) * block_h));
    
    // Clamp to texture size
    end_x = min(end_x, int(width));
    end_y = min(end_y, int(height));
    
    float min_val = 1e30;
    float max_val = -1e30;
    
    uint channelCount = 4u;
    
    for (int y = start_y; y < end_y; y++) {
        for (int x = start_x; x < end_x; x++) {
            vec4 texel = texelFetch(inputTex, ivec2(x, y), 0);
            float val = value_map_component(texel, channelCount);
            min_val = min(min_val, val);
            max_val = max(max_val, val);
        }
    }
    
    // If block was empty (shouldn't happen if size >= 32x32), handle it
    if (min_val > max_val) {
        min_val = 0.0;
        max_val = 0.0;
    }
    
    fragColor = vec4(min_val, max_val, 0.0, 1.0);
}
