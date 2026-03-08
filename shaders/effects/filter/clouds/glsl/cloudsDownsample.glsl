#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform float time;
uniform float speed;
uniform float scale;

out vec4 fragColor;

const uint CHANNEL_COUNT = 4u;
const uint CONTROL_OCTAVES = 8u;
const uint WARP_OCTAVES = 2u;
const uint WARP_SUB_OCTAVES = 3u;
const float WARP_DISPLACEMENT = 0.0;  // Disabled - clean cloud shapes
const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

const vec3 CONTROL_BASE_SEED = vec3(17.0, 29.0, 47.0);
const vec3 CONTROL_TIME_SEED = vec3(71.0, 113.0, 191.0);
const vec3 WARP_BASE_SEED = vec3(23.0, 37.0, 59.0);
const vec3 WARP_TIME_SEED = vec3(83.0, 127.0, 211.0);

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float wrap_component(float value, float size) {
    if (size <= 0.0) {
        return 0.0;
    }
    float wrapped = value - floor(value / size) * size;
    if (wrapped < 0.0) {
        return wrapped + size;
    }
    return wrapped;
}

vec2 wrap_coord(vec2 coord, vec2 dims) {
    return vec2(wrap_component(coord.x, dims.x), wrap_component(coord.y, dims.y));
}

vec2 freq_for_shape(float base_freq, vec2 dims) {
    float width = max(dims.x, 1.0);
    float height = max(dims.y, 1.0);
    if (abs(width - height) < 0.5) {
        return vec2(base_freq, base_freq);
    }
    if (height < width) {
        return vec2(base_freq, base_freq * width / height);
    }
    return vec2(base_freq * height / width, base_freq);
}

float ridge_transform(float value) {
    return 1.0 - abs(value * 2.0 - 1.0);
}

float normalized_sine(float value) {
    return sin(value) * 0.5 + 0.5;
}

float periodic_value(float value, float phase) {
    return normalized_sine((value - phase) * TAU);
}

vec3 mod_289_vec3(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod_289_vec4(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod_289_vec4(((x * 34.0) + 1.0) * x);
}

vec4 taylor_inv_sqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float simplex_noise(vec3 v) {
    vec2 c = vec2(1.0 / 6.0, 1.0 / 3.0);
    vec4 d = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i0 = floor(v + dot(v, vec3(c.y)));
    vec3 x0 = v - i0 + dot(i0, vec3(c.x));

    vec3 step1 = step(vec3(x0.y, x0.z, x0.x), x0);
    vec3 l = vec3(1.0) - step1;
    vec3 i1 = min(step1, vec3(l.z, l.x, l.y));
    vec3 i2 = max(step1, vec3(l.z, l.x, l.y));

    vec3 x1 = x0 - i1 + vec3(c.x);
    vec3 x2 = x0 - i2 + vec3(c.y);
    vec3 x3 = x0 - vec3(d.y);

    vec3 i = mod_289_vec3(i0);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.14285714285714285;
    vec3 ns = n_ * vec3(d.w, d.y, d.z) - vec3(d.x, d.z, d.x);

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.y;
    vec4 y = y_ * ns.x + ns.y;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.x, x.y, y.x, y.y);
    vec4 b1 = vec4(x.z, x.w, y.z, y.w);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = vec4(b0.x, b0.z, b0.y, b0.w)
        + vec4(s0.x, s0.z, s0.y, s0.w) * vec4(sh.x, sh.x, sh.y, sh.y);
    vec4 a1 = vec4(b1.x, b1.z, b1.y, b1.w)
        + vec4(s1.x, s1.z, s1.y, s1.w) * vec4(sh.z, sh.z, sh.w, sh.w);

    vec3 g0 = vec3(a0.x, a0.y, h.x);
    vec3 g1 = vec3(a0.z, a0.w, h.y);
    vec3 g2 = vec3(a1.x, a1.y, h.z);
    vec3 g3 = vec3(a1.z, a1.w, h.w);

    vec4 norm = taylor_inv_sqrt(vec4(
        dot(g0, g0),
        dot(g1, g1),
        dot(g2, g2),
        dot(g3, g3)
    ));

    vec3 g0n = g0 * norm.x;
    vec3 g1n = g1 * norm.y;
    vec3 g2n = g2 * norm.z;
    vec3 g3n = g3 * norm.w;

    float m0 = max(0.6 - dot(x0, x0), 0.0);
    float m1 = max(0.6 - dot(x1, x1), 0.0);
    float m2 = max(0.6 - dot(x2, x2), 0.0);
    float m3 = max(0.6 - dot(x3, x3), 0.0);

    float m0sq = m0 * m0;
    float m1sq = m1 * m1;
    float m2sq = m2 * m2;
    float m3sq = m3 * m3;

    return 42.0 * (
        m0sq * m0sq * dot(g0n, x0) +
        m1sq * m1sq * dot(g1n, x1) +
        m2sq * m2sq * dot(g2n, x2) +
        m3sq * m3sq * dot(g3n, x3)
    );
}

float animated_simplex_value(
    vec2 coord,
    vec2 dims,
    vec2 freq,
    float time_value,
    float speed_value,
    vec3 base_seed,
    vec3 time_seed
) {
    // Slow down animation - time in shaders increments much faster than Python
    float slow_time = time_value * 0.002;  // ~500x slower for gentle cloud drift
    float angle = TAU * slow_time;
    float z_coord = cos(angle) * speed_value;

    vec2 scale = freq / dims;
    vec2 scaled_coord = coord * scale;

    // Simplex returns ~[-1, 1], normalize to [0, 1] to match Python
    float base_noise = simplex_noise(vec3(
        scaled_coord.x + base_seed.x,
        scaled_coord.y + base_seed.y,
        z_coord
    ));
    base_noise = base_noise * 0.5 + 0.5;  // [-1,1] -> [0,1]

    if (speed_value == 0.0 || time_value == 0.0) {
        return base_noise;
    }

    float time_noise = simplex_noise(vec3(
        scaled_coord.x + time_seed.x,
        scaled_coord.y + time_seed.y,
        1.0
    ));
    time_noise = time_noise * 0.5 + 0.5;  // [-1,1] -> [0,1]

    float scaled_time = periodic_value(time_value, time_noise) * speed_value;
    return periodic_value(scaled_time, base_noise);
}

float seeded_base_frequency(vec2 dims) {
    float hash_val = fract(sin(dot(dims, vec2(12.9898, 78.233))) * 43758.5453123);
    return floor(hash_val * 3.0) + 2.0;
}

float simplex_multires_value(
    vec2 coord,
    vec2 dims,
    vec2 base_freq,
    float time_value,
    float speed_value,
    uint octaves,
    bool ridged,
    vec3 base_seed,
    vec3 time_seed
) {
    vec2 safe_dims = vec2(max(dims.x, 1.0), max(dims.y, 1.0));

    float accum = 0.0;

    for (uint octave = 1u; octave <= octaves; octave = octave + 1u) {
        float multiplier = pow(2.0, float(octave));
        vec2 octave_freq = vec2(
            base_freq.x * 0.5 * multiplier,
            base_freq.y * 0.5 * multiplier
        );

        if (octave_freq.x > safe_dims.x && octave_freq.y > safe_dims.y) {
            break;
        }

        vec3 seed_offset = vec3(
            float(octave) * 37.0,
            float(octave) * 53.0,
            float(octave) * 19.0
        );
        vec3 time_offset = vec3(
            float(octave) * 41.0,
            float(octave) * 23.0,
            float(octave) * 61.0
        );

        float sample_value = animated_simplex_value(
            coord,
            safe_dims,
            octave_freq,
            time_value + float(octave) * 0.07,
            speed_value,
            base_seed + seed_offset,
            time_seed + time_offset
        );

        float layer = sample_value;
        if (ridged) {
            layer = ridge_transform(layer);
        }

        float amplitude = 1.0 / multiplier;
        accum = accum + layer * amplitude;
    }

    return accum;
}

vec2 warp_coordinate(
    vec2 coord,
    vec2 dims,
    float time_value,
    float speed_value
) {
    vec2 warped = coord;
    vec2 base_freq = freq_for_shape(3.0, dims);

    for (uint octave = 0u; octave < WARP_OCTAVES; octave = octave + 1u) {
        vec2 freq_scale = base_freq * pow(2.0, float(octave));
        float flow_x = simplex_multires_value(
            warped,
            dims,
            freq_scale,
            time_value + float(octave) * 0.21,
            speed_value,
            WARP_SUB_OCTAVES,
            false,
            WARP_BASE_SEED + vec3(float(octave) * 13.0, float(octave) * 17.0, float(octave) * 19.0),
            WARP_TIME_SEED + vec3(float(octave) * 23.0, float(octave) * 29.0, float(octave) * 31.0)
        );

        float flow_y = simplex_multires_value(
            wrap_coord(warped + vec2(0.5, 0.5), dims),
            dims,
            freq_scale,
            time_value + float(octave) * 0.37,
            speed_value,
            WARP_SUB_OCTAVES,
            false,
            WARP_BASE_SEED + vec3(float(octave) * 19.0, float(octave) * 23.0, float(octave) * 29.0) + vec3(11.0, 7.0, 5.0),
            WARP_TIME_SEED + vec3(float(octave) * 31.0, float(octave) * 37.0, float(octave) * 41.0) + vec3(13.0, 19.0, 17.0)
        );

        vec2 offset_vec = vec2(flow_x * 2.0 - 1.0, flow_y * 2.0 - 1.0);
        float displacement = WARP_DISPLACEMENT / pow(2.0, float(octave));
        // Python warp uses displacement as fraction of image, not multiplied by dims
        warped = wrap_coord(warped + offset_vec * displacement * min(dims.x, dims.y), dims);
    }

    return warped;
}

float control_value_at(
    vec2 coord,
    vec2 dims,
    float time_value,
    float speed_value
) {
    float base_freq_value = seeded_base_frequency(dims);
    vec2 freq_vec = freq_for_shape(base_freq_value, dims);
    vec2 warped_coord = warp_coordinate(coord, dims, 0.0, 1.0);
    return simplex_multires_value(
        warped_coord,
        dims,
        freq_vec,
        time_value,
        speed_value,
        CONTROL_OCTAVES,
        true,
        CONTROL_BASE_SEED,
        CONTROL_TIME_SEED
    );
}

void main() {
    float down_width = resolution.x;
    float down_height = resolution.y;
    vec2 down_dims = vec2(down_width, down_height);
    
    if (gl_FragCoord.x >= down_width || gl_FragCoord.y >= down_height) {
        fragColor = vec4(0.0);
        return;
    }
    
    vec2 coord = floor(gl_FragCoord.xy);
    float time_value = time;
    float speed_value = speed;

    float control_raw = control_value_at(coord, down_dims, time_value, speed_value);
    
    fragColor = vec4(0.0, 0.0, control_raw, 1.0);
}
