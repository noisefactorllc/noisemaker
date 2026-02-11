#version 300 es

precision highp float;
precision highp int;

// FXAA antialiasing pass translated from noisemaker/value.py:fxaa.
// Applies an edge-aware blur weighted by luminance differences while preserving alpha.


const uint CHANNEL_COUNT = 4u;
const float EPSILON = 1e-10;
const vec3 LUMA_WEIGHTS = vec3(0.299, 0.587, 0.114);

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float fxaaStrength;
uniform float fxaaSharpness;
uniform float fxaaThreshold;

uint as_u32(float value) {
    return uint(max(round(value), 0.0));
}

uint sanitized_channelCount(float channel_value) {
    int rounded = int(round(channel_value));
    if (rounded <= 1) {
        return 1u;
    }
    if (rounded >= 4) {
        return 4u;
    }
    return uint(rounded);
}

int reflect_coord(int coord, int limit) {
    if (limit <= 1) {
        return 0;
    }

    int period = 2 * limit - 2;
    int wrapped = coord % period;
    if (wrapped < 0) {
        wrapped = wrapped + period;
    }

    if (wrapped < limit) {
        return wrapped;
    }

    return period - wrapped;
}

vec4 load_texel(ivec2 coord, ivec2 size) {
    int reflected_x = reflect_coord(coord.x, size.x);
    int reflected_y = reflect_coord(coord.y, size.y);
    return texelFetch(inputTex, ivec2(reflected_x, reflected_y), 0);
}

float luminance_from_rgb(vec3 rgb) {
    return dot(rgb, LUMA_WEIGHTS);
}

float weight_from_luma(float center_luma, float neighbor_luma) {
    return exp(-fxaaSharpness * abs(center_luma - neighbor_luma));
}


out vec4 fragColor;

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint width_u = max(as_u32(resolution.x), 1u);
    uint height_u = max(as_u32(resolution.y), 1u);
    if (global_id.x >= width_u || global_id.y >= height_u) {
        return;
    }

    uint channelCount = 4u;  // Always RGBA

    ivec2 image_size = ivec2(int(width_u), int(height_u));
    ivec2 pixel_coord = ivec2(int(global_id.x), int(global_id.y));

    vec4 center_texel = load_texel(pixel_coord, image_size);
    vec4 north_texel = load_texel(pixel_coord + ivec2(0, -1), image_size);
    vec4 south_texel = load_texel(pixel_coord + ivec2(0, 1), image_size);
    vec4 west_texel = load_texel(pixel_coord + ivec2(-1, 0), image_size);
    vec4 east_texel = load_texel(pixel_coord + ivec2(1, 0), image_size);

    vec3 center_rgb = center_texel.xyz;
    vec3 north_rgb = north_texel.xyz;
    vec3 south_rgb = south_texel.xyz;
    vec3 west_rgb = west_texel.xyz;
    vec3 east_rgb = east_texel.xyz;

    float center_luma;
    float north_luma;
    float south_luma;
    float west_luma;
    float east_luma;

    if (channelCount >= 3u) {
        center_luma = luminance_from_rgb(center_rgb);
        north_luma = luminance_from_rgb(north_rgb);
        south_luma = luminance_from_rgb(south_rgb);
        west_luma = luminance_from_rgb(west_rgb);
        east_luma = luminance_from_rgb(east_rgb);
    } else {
        center_luma = center_texel.x;
        north_luma = north_texel.x;
        south_luma = south_texel.x;
        west_luma = west_texel.x;
        east_luma = east_texel.x;
    }

    // Threshold: skip AA when max luma contrast is below threshold
    float maxDiff = max(
        max(abs(center_luma - north_luma), abs(center_luma - south_luma)),
        max(abs(center_luma - west_luma), abs(center_luma - east_luma))
    );
    if (maxDiff < fxaaThreshold) {
        fragColor = center_texel;
        return;
    }

    float weight_center = 1.0;
    float weight_north = weight_from_luma(center_luma, north_luma);
    float weight_south = weight_from_luma(center_luma, south_luma);
    float weight_west = weight_from_luma(center_luma, west_luma);
    float weight_east = weight_from_luma(center_luma, east_luma);
    float weight_sum = weight_center + weight_north + weight_south + weight_west + weight_east + EPSILON;

    vec4 result_texel = center_texel;
    if (channelCount <= 2u) {
        float blended_luma = (
            center_texel.x * weight_center
            + north_texel.x * weight_north
            + south_texel.x * weight_south
            + west_texel.x * weight_west
            + east_texel.x * weight_east
        ) / weight_sum;

        result_texel.x = blended_luma;
        if (channelCount == 1u) {
            result_texel.y = center_texel.y;
            result_texel.z = center_texel.z;
        }
    } else {
        vec3 blended_rgb = (
            center_rgb * weight_center
            + north_rgb * weight_north
            + south_rgb * weight_south
            + west_rgb * weight_west
            + east_rgb * weight_east
        ) / weight_sum;

    result_texel = vec4(blended_rgb, result_texel.w);
    }

    result_texel.w = center_texel.w;

    // Strength: blend between original and AA result
    fragColor = mix(center_texel, result_texel, fxaaStrength);
}
