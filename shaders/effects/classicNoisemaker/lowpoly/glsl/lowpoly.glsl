#version 300 es
precision highp float;
precision highp int;

const uint CHANNEL_COUNT = 4u;
const float NORMAL_Z_SCALE = 1.6;

uniform sampler2D inputTex;
uniform vec4 dims;
uniform float distrib;
uniform float freq;
uniform float time;
uniform float speed;
uniform float shape;
uniform sampler2D voronoiColorTexture;
uniform sampler2D voronoiRangeTexture;

layout(location = 0) out vec4 fragColor;

uint as_u32(float value) {
    return uint(max(round(value), 0.0));
}

int clamp_coord(int value, int limit) {
    if (limit <= 0) {
        return 0;
    }
    if (limit == 1) {
        return 0;
    }
    return clamp(value, 0, limit - 1);
}

float sample_range(ivec2 coord) {
    return texelFetch(voronoiRangeTexture, coord, 0).x;
}

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

float compute_shading(ivec2 coords, int width, int height) {
    if (width <= 0 || height <= 0) {
        return 1.0;
    }

    ivec2 left_coord = ivec2(clamp_coord(coords.x - 1, width), coords.y);
    ivec2 right_coord = ivec2(clamp_coord(coords.x + 1, width), coords.y);
    ivec2 up_coord = ivec2(coords.x, clamp_coord(coords.y - 1, height));
    ivec2 down_coord = ivec2(coords.x, clamp_coord(coords.y + 1, height));

    float left_val = sample_range(left_coord);
    float right_val = sample_range(right_coord);
    float up_val = sample_range(up_coord);
    float down_val = sample_range(down_coord);

    float dx = right_val - left_val;
    float dy = down_val - up_val;
    vec3 normal = normalize(vec3(-dx, -dy, NORMAL_Z_SCALE));
    vec3 light_dir = normalize(vec3(0.35, 0.55, 1.0));
    float lambert = clamp(dot(normal, light_dir), 0.1, 1.0);
    float rim = pow(1.0 - clamp(sample_range(coords), 0.0, 1.0), 2.0);
    return clamp(lambert * 0.85 + rim * 0.15, 0.1, 1.2);
}

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint width_u = as_u32(dims.x);
    uint height_u = as_u32(dims.y);
    ivec2 inputDims = textureSize(inputTex, 0);
    if (width_u == 0u) {
        width_u = uint(max(inputDims.x, 1));
    }
    if (height_u == 0u) {
        height_u = uint(max(inputDims.y, 1));
    }
    if (global_id.x >= width_u || global_id.y >= height_u) {
        return;
    }

    ivec2 coords = ivec2(int(global_id.x), int(global_id.y));
    vec4 base_sample = texelFetch(inputTex, coords, 0);
    vec4 voronoi_color_sample = texelFetch(voronoiColorTexture, coords, 0);
    vec4 voronoi_range_sample = texelFetch(voronoiRangeTexture, coords, 0);

    float range_value = clamp(voronoi_range_sample.x, 0.0, 1.0);
    vec3 distance_rgb = vec3(range_value, range_value, range_value);
    vec3 color_rgb = voronoi_color_sample.xyz;
    vec3 direct_mix = mix(distance_rgb, color_rgb, 0.125);

    int width_i = int(width_u);
    int height_i = int(height_u);
    float shade = compute_shading(coords, width_i, height_i);

    float detail_mix = clamp(luminance(color_rgb) * 0.75 + 0.25, 0.0, 1.5);
    vec3 faceted = direct_mix * shade * detail_mix;
    vec3 subtle_original = mix(faceted, base_sample.xyz, 0.1);

    fragColor = vec4(subtle_original, base_sample.w);
}
