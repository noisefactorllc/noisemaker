#version 300 es

precision highp float;
precision highp int;

// Degauss: simulate a CRT-style degaussing wobble by lens-warping
// each color channel independently. Based on the Python
// implementation in effects.degauss(), which repeatedly invokes
// lens_warp() with simplex noise-derived displacements.

const float TAU = 6.28318530717958647692;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float displacement;
uniform float speed;

out vec4 fragColor;

uint as_u32(float value) {
    return uint(max(value, 0.0));
}

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

float wrap_float(float value, float limit) {
    if (limit <= 0.0) {
        return 0.0;
    }
    float result = value - floor(value / limit) * limit;
    if (result < 0.0) {
        result = result + limit;
    }
    return result;
}

vec2 freq_for_shape(float base_freq, float width, float height) {
    if (base_freq <= 0.0) {
        return vec2(1.0, 1.0);
    }

    if (abs(width - height) < 1e-5) {
        return vec2(base_freq, base_freq);
    }

    if (height < width && height > 0.0) {
        return vec2(base_freq, base_freq * width / height);
    }

    if (width > 0.0) {
        return vec2(base_freq * height / width, base_freq);
    }

    return vec2(base_freq, base_freq);
}

float normalized_sine(float value) {
    return sin(value) * 0.5 + 0.5;
}

float periodic_value(float time, float value) {
    return normalized_sine((time - value) * TAU);
}

vec3 mod289_vec3(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289_vec4(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
    return mod289_vec4(((x * 34.0) + 1.0) * x);
}

vec4 taylor_inv_sqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float simplex_noise(vec3 v) {
    vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i0 = floor(v + dot(v, vec3(C.y)));
    vec3 x0 = v - i0 + dot(i0, vec3(C.x));

    vec3 step1 = step(vec3(x0.y, x0.z, x0.x), x0);
    vec3 l = vec3(1.0) - step1;
    vec3 i1 = min(step1, vec3(l.z, l.x, l.y));
    vec3 i2 = max(step1, vec3(l.z, l.x, l.y));

    vec3 x1 = x0 - i1 + vec3(C.x);
    vec3 x2 = x0 - i2 + vec3(C.y);
    vec3 x3 = x0 - vec3(D.y);

    vec3 i = mod289_vec3(i0);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.14285714285714285;
    vec3 ns = n_ * vec3(D.w, D.y, D.z) - vec3(D.x, D.z, D.x);

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
        m0sq * m0sq * dot(g0n, x0)
        + m1sq * m1sq * dot(g1n, x1)
        + m2sq * m2sq * dot(g2n, x2)
        + m3sq * m3sq * dot(g3n, x3)
    );
}

float compute_noise_value(
    uvec2 coord,
    float width,
    float height,
    vec2 freq,
    float time,
    float speed,
    uint channel
) {
    float width_safe = max(width, 1.0);
    float height_safe = max(height, 1.0);
    float freq_x = max(freq.y, 1.0);
    float freq_y = max(freq.x, 1.0);

    vec2 uv = vec2(
        (float(coord.x) / width_safe) * freq_x,
        (float(coord.y) / height_safe) * freq_y
    );

    float angle = time * TAU;
    float z_base = cos(angle) * speed;
    float channel_offset = float(channel) * 37.0;
    vec3 base_seed = vec3(
        17.0 + channel_offset,
        29.0 + channel_offset * 1.3,
        47.0 + channel_offset * 1.7
    );

    float base_noise = simplex_noise(vec3(
        uv.x + base_seed.x,
        uv.y + base_seed.y,
        z_base + base_seed.z
    ));

    float value = clamp(base_noise * 0.5 + 0.5, 0.0, 1.0);

    if (speed != 0.0 && time != 0.0) {
        vec3 time_seed = vec3(
            base_seed.x + 54.0,
            base_seed.y + 82.0,
            base_seed.z + 124.0
        );
        float time_noise = simplex_noise(vec3(
            uv.x + time_seed.x,
            uv.y + time_seed.y,
            time_seed.z
        ));
        float time_value = clamp(time_noise * 0.5 + 0.5, 0.0, 1.0);
        float scaled_time = periodic_value(time, time_value) * speed;
        value = clamp01(periodic_value(scaled_time, value));
    }

    return clamp01(value);
}

float singularity_mask(vec2 uv, float width, float height) {
    if (width <= 0.0 || height <= 0.0) {
        return 0.0;
    }

    vec2 delta = abs(uv - vec2(0.5, 0.5));
    float aspect = width / height;
    vec2 scaled = vec2(delta.x * aspect, delta.y);
    float max_radius = length(vec2(aspect * 0.5, 0.5));
    if (max_radius <= 0.0) {
        return 0.0;
    }

    float normalized = clamp(length(scaled) / max_radius, 0.0, 1.0);
    float masked = sqrt(normalized);
    return pow(masked, 5.0);
}

vec4 sample_bilinear(vec2 pos, float width, float height) {
    float width_f = max(width, 1.0);
    float height_f = max(height, 1.0);

    float wrapped_x = wrap_float(pos.x, width_f);
    float wrapped_y = wrap_float(pos.y, height_f);

    int x0 = int(floor(wrapped_x));
    int y0 = int(floor(wrapped_y));

    int width_i = int(max(width, 1.0));
    int height_i = int(max(height, 1.0));

    if (x0 < 0) {
        x0 = 0;
    } else if (x0 >= width_i) {
        x0 = width_i - 1;
    }

    if (y0 < 0) {
        y0 = 0;
    } else if (y0 >= height_i) {
        y0 = height_i - 1;
    }

    int x1 = wrap_index(x0 + 1, width_i);
    int y1 = wrap_index(y0 + 1, height_i);

    float fx = clamp(wrapped_x - float(x0), 0.0, 1.0);
    float fy = clamp(wrapped_y - float(y0), 0.0, 1.0);

    vec4 tex00 = texelFetch(inputTex, ivec2(x0, y0), 0);
    vec4 tex10 = texelFetch(inputTex, ivec2(x1, y0), 0);
    vec4 tex01 = texelFetch(inputTex, ivec2(x0, y1), 0);
    vec4 tex11 = texelFetch(inputTex, ivec2(x1, y1), 0);

    vec4 mix_x0 = mix(tex00, tex10, vec4(fx));
    vec4 mix_x1 = mix(tex01, tex11, vec4(fx));
    return mix(mix_x0, mix_x1, vec4(fy));
}

float warped_channel_value(
    uint channel,
    uvec2 coord,
    vec2 base_pos,
    float width,
    float height,
    vec2 freq,
    float displacement,
    float mask,
    float time,
    float speed
) {
    float noise_value = compute_noise_value(coord, width, height, freq, time, speed, channel);
    float centered = (noise_value * 2.0 - 1.0) * mask;
    float angle = centered * TAU;
    vec2 offset = vec2(cos(angle), sin(angle)) * displacement * vec2(width, height);
    
    vec2 sample_pos = base_pos + offset;
    vec4 sampled = sample_bilinear(sample_pos, width, height);
    
    if (channel == 0u) return sampled.r;
    if (channel == 1u) return sampled.g;
    if (channel == 2u) return sampled.b;
    return sampled.a;
}

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint width = as_u32(resolution.x);
    uint height = as_u32(resolution.y);
    if (global_id.x >= width || global_id.y >= height) {
        return;
    }

    vec2 coords = vec2(int(global_id.x), int(global_id.y));
    vec4 original = texelFetch(inputTex, ivec2(coords), 0);

    if (displacement == 0.0) {
        fragColor = original;
        return;
    }

    float width_f = resolution.x;
    float height_f = resolution.y;
    vec2 uv = (vec2(float(global_id.x), float(global_id.y)) + vec2(0.5, 0.5))
        / vec2(max(width_f, 1.0), max(height_f, 1.0));
    float mask = singularity_mask(uv, width_f, height_f);
    if (mask <= 0.0) {
        fragColor = original;
        return;
    }

    vec2 freq = freq_for_shape(2.0, width_f, height_f);
    vec2 base_pos = vec2(float(global_id.x), float(global_id.y));
    uvec2 coord = global_id.xy;

    float red = warped_channel_value(
        0u,
        coord,
        base_pos,
        width_f,
        height_f,
        freq,
        displacement,
        mask,
        time,
        speed
    );
    float green = warped_channel_value(
        1u,
        coord,
        base_pos,
        width_f,
        height_f,
        freq,
        displacement,
        mask,
        time,
        speed
    );
    float blue = warped_channel_value(
        2u,
        coord,
        base_pos,
        width_f,
        height_f,
        freq,
        displacement,
        mask,
        time,
        speed
    );
    float alpha = clamp01(original.w);

    fragColor = vec4(red, green, blue, alpha);
}
