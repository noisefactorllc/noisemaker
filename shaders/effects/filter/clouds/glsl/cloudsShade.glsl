#version 300 es
precision highp float;
precision highp int;

uniform sampler2D downsampleTex;
uniform sampler2D statsTex;
uniform vec2 resolution;
uniform float time;
uniform float speed;
uniform float scale;

out vec4 fragColor;

const uint CHANNEL_COUNT = 4u;
const int BLUR_RADIUS = 6;
const float TRIPLE_GAUSS_KERNEL[13] = float[13](
    0.0002441406,
    0.0029296875,
    0.0161132812,
    0.0537109375,
    0.1208496094,
    0.1933593750,
    0.2255859375,
    0.1933593750,
    0.1208496094,
    0.0537109375,
    0.0161132812,
    0.0029296875,
    0.0002441406
);

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

int wrap_index(int value, int limit) {
    if (limit <= 0) {
        return 0;
    }
    int wrapped = value % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

float read_channel(ivec2 coord, ivec2 size, uint channel) {
    int width = max(size.x, 1);
    int height = max(size.y, 1);
    int safe_x = wrap_index(coord.x, width);
    int safe_y = wrap_index(coord.y, height);
    
    vec4 val = texelFetch(downsampleTex, ivec2(safe_x, safe_y), 0);
    if (channel == 0u) return val.r;
    if (channel == 1u) return val.g;
    if (channel == 2u) return val.b;
    return val.a;
}

float normalize_control(float raw_value, float min_value, float max_value) {
    float delta = max(max_value - min_value, 1e-6);
    return clamp((raw_value - min_value) / delta, 0.0, 1.0);
}

float combined_from_normalized(float control_norm) {
    // Python blend_layers(control, 1.0, ones, zeros):
    // - control in [0, 0.5]: result = 1 - control*2 (white fading to black)
    // - control >= 0.5: result = 0 (black)
    // This matches: max(1.0 - control * 2.0, 0.0)
    float scaled = control_norm * 2.0;
    return max(1.0 - scaled, 0.0);
}

float combined_from_raw(float raw_value, float min_value, float max_value) {
    float control_norm = normalize_control(raw_value, min_value, max_value);
    return combined_from_normalized(control_norm);
}

float blur_shade(ivec2 coord, ivec2 size, ivec2 offset, float min_value, float max_value) {
    int width = max(size.x, 1);
    int height = max(size.y, 1);
    
    float accum = 0.0;
    for (int dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy++) {
        float weight_y = TRIPLE_GAUSS_KERNEL[dy + BLUR_RADIUS];
        float row_accum = 0.0;
        for (int dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx++) {
            float weight_x = TRIPLE_GAUSS_KERNEL[dx + BLUR_RADIUS];
            
            ivec2 sample_coord = ivec2(
                wrap_index(coord.x + dx + offset.x, width),
                wrap_index(coord.y + dy + offset.y, height)
            );
            
            float control_raw = read_channel(sample_coord, size, 2u);
            float combined = combined_from_raw(control_raw, min_value, max_value);
            float boosted = min(combined * 2.5, 1.0);
            row_accum = row_accum + boosted * weight_x;
        }
        accum = accum + row_accum * weight_y;
    }

    return clamp01(accum);
}

void main() {
    float down_width = resolution.x;
    float down_height = resolution.y;
    
    if (gl_FragCoord.x >= down_width || gl_FragCoord.y >= down_height) {
        fragColor = vec4(0.0);
        return;
    }

    ivec2 size_i = ivec2(down_width, down_height);
    ivec2 coord_i = ivec2(floor(gl_FragCoord.xy));
    
    // Compute seeded random offset for shadow (Python: rng.random_int(-15, 15))
    // Use resolution-based hash to get deterministic but varying offset
    float hash1 = fract(sin(dot(resolution, vec2(12.9898, 78.233))) * 43758.5453);
    float hash2 = fract(sin(dot(resolution, vec2(53.2317, 91.7623))) * 28461.8291);
    int offset_x = int(floor(hash1 * 31.0)) - 15;  // -15 to +15
    int offset_y = int(floor(hash2 * 31.0)) - 15;  // -15 to +15
    ivec2 offset_i = ivec2(offset_x, offset_y);

    // Read global min/max from stats texture (computed via reduction)
    vec4 stats = texelFetch(statsTex, ivec2(0, 0), 0);
    float min_value = stats.r;
    float max_value = stats.g;
    
    float control_raw = read_channel(coord_i, size_i, 2u);
    float combined = combined_from_raw(control_raw, min_value, max_value);
    float shade = blur_shade(coord_i, size_i, offset_i, min_value, max_value);
    
    fragColor = vec4(combined, shade, control_raw, 1.0);
}
