#version 300 es

precision highp float;
precision highp int;

// Grain: blend the source image with animated value noise.
// Mirrors noisemaker.effects.grain, which calls value.values()
// using simplex-based value noise with bicubic interpolation.

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;
const float UINT32_TO_FLOAT = 1.0 / 4294967296.0;
const uint CHANNEL_COUNT = 4u;
const uint INTERPOLATION_CONSTANT = 0u;
const uint INTERPOLATION_LINEAR = 1u;
const uint INTERPOLATION_COSINE = 2u;
const uint INTERPOLATION_BICUBIC = 3u;
const uint BASE_SEED = 0x1234u;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float renderScale;
uniform float alpha;
uniform float time;
uniform float pause;

out vec4 fragColor;

uint as_u32(float value) {
    return uint(max(round(value), 0.0));
}

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

uvec3 pcg3d(uvec3 v_in) {
    uvec3 v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> uvec3(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

float random_from_cell_3d(ivec3 cell, uint seed) {
    uvec3 hashed = uvec3(
        uint(cell.x) ^ seed,
        uint(cell.y) ^ (seed * 0x9e3779b9u + 0x7f4a7c15u),
        uint(cell.z) ^ (seed * 0x632be59bu + 0x5bf03635u)
    );
    uvec3 noise = pcg3d(hashed);
    return float(noise.x) * UINT32_TO_FLOAT;
}

float periodic_value(float time_value, float sample_val) {
    return (sin((time_value - sample_val) * TAU) + 1.0) * 0.5;
}

float interpolation_weight(float value, uint spline_order) {
    if (spline_order == INTERPOLATION_COSINE) {
        float clamped = clamp(value, 0.0, 1.0);
        float angle = clamped * PI;
        float cos_value = cos(angle);
        return (1.0 - cos_value) * 0.5;
    }
    return value;
}

float blend_cubic(float a, float b, float c, float d, float g) {
    float t = clamp(g, 0.0, 1.0);
    float t2 = t * t;
    float a0 = ((d - c) - a) + b;
    float a1 = (a - b) - a0;
    float a2 = c - a;
    float a3 = b;
    float term1 = (a0 * t) * t2;
    float term2 = a1 * t2;
    float term3 = (a2 * t) + a3;
    return (term1 + term2) + term3;
}

float sample_bicubic_layer(
    ivec2 cell,
    vec2 frac,
    int z_cell,
    uint base_seed
) {
    float row0 = blend_cubic(
        random_from_cell_3d(ivec3(cell.x - 1, cell.y - 1, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 0, cell.y - 1, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 1, cell.y - 1, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 2, cell.y - 1, z_cell), base_seed),
        frac.x
    );
    float row1 = blend_cubic(
        random_from_cell_3d(ivec3(cell.x - 1, cell.y + 0, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 0, cell.y + 0, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 1, cell.y + 0, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 2, cell.y + 0, z_cell), base_seed),
        frac.x
    );
    float row2 = blend_cubic(
        random_from_cell_3d(ivec3(cell.x - 1, cell.y + 1, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 0, cell.y + 1, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 1, cell.y + 1, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 2, cell.y + 1, z_cell), base_seed),
        frac.x
    );
    float row3 = blend_cubic(
        random_from_cell_3d(ivec3(cell.x - 1, cell.y + 2, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 0, cell.y + 2, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 1, cell.y + 2, z_cell), base_seed),
        random_from_cell_3d(ivec3(cell.x + 2, cell.y + 2, z_cell), base_seed),
        frac.x
    );
    return blend_cubic(row0, row1, row2, row3, frac.y);
}

float sample_raw_value_noise(
    vec2 uv,
    vec2 freq,
    uint base_seed,
    float time_value,
    float speed_value,
    uint spline_order
) {
    vec2 scaled_freq = max(freq, vec2(1.0, 1.0));
    vec2 scaled_uv = uv * scaled_freq;
    vec2 cell_f = floor(scaled_uv);
    ivec2 cell = ivec2(int(cell_f.x), int(cell_f.y));
    vec2 frac = fract(scaled_uv);
    float angle = time_value * TAU;
    float time_coord = cos(angle) * speed_value;
    float time_floor = floor(time_coord);
    int time_cell = int(time_floor);
    float time_frac = fract(time_coord);

    if (spline_order == INTERPOLATION_CONSTANT) {
        return random_from_cell_3d(ivec3(cell.x, cell.y, time_cell), base_seed);
    }

    if (spline_order == INTERPOLATION_LINEAR) {
        float tl = random_from_cell_3d(ivec3(cell.x, cell.y, time_cell), base_seed);
        float tr = random_from_cell_3d(ivec3(cell.x + 1, cell.y, time_cell), base_seed);
        float bl = random_from_cell_3d(ivec3(cell.x, cell.y + 1, time_cell), base_seed);
        float br = random_from_cell_3d(ivec3(cell.x + 1, cell.y + 1, time_cell), base_seed);
        float weight_x = interpolation_weight(frac.x, spline_order);
        float top = mix(tl, tr, weight_x);
        float bottom = mix(bl, br, weight_x);
        float weight_y = interpolation_weight(frac.y, spline_order);
        return mix(top, bottom, weight_y);
    }

    if (spline_order == INTERPOLATION_COSINE) {
        float weight_x = interpolation_weight(frac.x, spline_order);
        float weight_y = interpolation_weight(frac.y, spline_order);
        float tl = random_from_cell_3d(ivec3(cell.x, cell.y, time_cell), base_seed);
        float tr = random_from_cell_3d(ivec3(cell.x + 1, cell.y, time_cell), base_seed);
        float bl = random_from_cell_3d(ivec3(cell.x, cell.y + 1, time_cell), base_seed);
        float br = random_from_cell_3d(ivec3(cell.x + 1, cell.y + 1, time_cell), base_seed);
        float top = mix(tl, tr, weight_x);
        float bottom = mix(bl, br, weight_x);
        return mix(top, bottom, weight_y);
    }

    float slice0 = sample_bicubic_layer(cell, frac, time_cell - 1, base_seed);
    float slice1 = sample_bicubic_layer(cell, frac, time_cell + 0, base_seed);
    float slice2 = sample_bicubic_layer(cell, frac, time_cell + 1, base_seed);
    float slice3 = sample_bicubic_layer(cell, frac, time_cell + 2, base_seed);
    return blend_cubic(slice0, slice1, slice2, slice3, time_frac);
}

float sample_value_noise(
    vec2 uv,
    vec2 freq,
    uint seed,
    float time_value,
    float speed_value,
    uint spline_order
) {
    uint base_seed = seed;
    float base_value = sample_raw_value_noise(
        uv,
        freq,
        base_seed,
        time_value,
        speed_value,
        spline_order
    );

    if (speed_value == 0.0 || time_value == 0.0) {
        return base_value;
    }

    uint time_seed = base_seed + 0x9e3779b1u;
    float time_field = sample_raw_value_noise(
        uv,
        freq,
        time_seed,
        0.0,
        1.0,
        spline_order
    );
    float scaled_time = periodic_value(time_value, time_field) * speed_value;
    return periodic_value(scaled_time, base_value);
}

float sample_grain_noise(
    uvec2 pixel_coords,
    vec2 dims,
    float time_value,
    float speed_value
) {
    float width = max(dims.x, 1.0);
    float height = max(dims.y, 1.0);
    vec2 uv = vec2(float(pixel_coords.x) / width, float(pixel_coords.y) / height);
    vec2 freq = vec2(width, height);
    return sample_value_noise(uv, freq, BASE_SEED, time_value, speed_value, INTERPOLATION_BICUBIC);
}

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint u_width = max(as_u32(resolution.x), 1u);
    uint u_height = max(as_u32(resolution.y), 1u);
    if (global_id.x >= u_width || global_id.y >= u_height) {
        return;
    }

    ivec2 coords = ivec2(int(global_id.x), int(global_id.y));
    vec4 texel = texelFetch(inputTex, coords, 0);

    float blend_alpha = clamp(alpha, 0.0, 1.0);
    if (blend_alpha <= 0.0) {
        fragColor = texel;
        return;
    }

    // When paused, use time=0 for static noise; otherwise use actual time
    float effective_time = pause > 0.5 ? 0.0 : time;

    // Scale pixel coordinates so grain size stays visually consistent
    float rs = max(renderScale, 1.0);
    uvec2 scaled_id = uvec2(vec2(global_id.xy) / rs);
    float noise_value = sample_grain_noise(
        scaled_id,
        vec2(float(u_width) / rs, float(u_height) / rs),
        effective_time,
        100.0
    );
    vec3 noise_rgb = vec3(noise_value);
    vec3 mixed_rgb = mix(texel.rgb, noise_rgb, blend_alpha);
    fragColor = vec4(
        clamp01(mixed_rgb.x),
        clamp01(mixed_rgb.y),
        clamp01(mixed_rgb.z),
        texel.a
    );
}
