#version 300 es
precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D wormTexture;
uniform float width;
uniform float height;
uniform float channelCount;
uniform float maskScale;
uniform float time;
uniform int seed;
uniform float speed;
out vec4 fragColor;

const float TAU = 6.28318530717958647692;
const uint CHANNEL_COUNT = 4u;

uint to_dimension(float value) {
    return uint(max(round(value), 0.0));
}

vec2 freq_for_shape(float base_freq, float width, float height) {
    float freq = max(base_freq, 1.0);
    if (abs(width - height) < 1e-5) {
        return vec2(freq, freq);
    }
    if (height < width && height > 0.0) {
        return vec2(freq * width / height, freq);
    }
    if (width > 0.0) {
        return vec2(freq, freq * height / width);
    }
    return vec2(freq, freq);
}

vec3 mod289_vec3(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289_vec4(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute_vec4(vec4 x) {
    return mod289_vec4(((x * 34.0) + 1.0) * x);
}

vec4 taylor_inv_sqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float simplex_noise(vec3 v) {
    vec2 c = vec2(1.0 / 6.0, 1.0 / 3.0);
    vec4 d = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i0 = floor(v + dot(v, vec3(c.y)));
    vec3 x0 = v - i0 + dot(i0, vec3(c.x));

    vec3 g = step(vec3(x0.y, x0.z, x0.x), x0);
    vec3 l = vec3(1.0) - g;
    vec3 i1 = min(g, vec3(l.z, l.x, l.y));
    vec3 i2 = max(g, vec3(l.z, l.x, l.y));

    vec3 x1 = x0 - i1 + vec3(c.x);
    vec3 x2 = x0 - i2 + vec3(c.y);
    vec3 x3 = x0 - vec3(d.y);

    vec3 i = mod289_vec3(i0);
    vec4 p = permute_vec4(permute_vec4(permute_vec4(
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

    return 42.0 * (m0sq * m0sq * dot(g0n, x0)
        + m1sq * m1sq * dot(g1n, x1)
        + m2sq * m2sq * dot(g2n, x2)
        + m3sq * m3sq * dot(g3n, x3));
}

float animated_simplex(
    vec2 pos,
    float width,
    float height,
    float base_freq,
    vec3 seed,
    float time_value,
    float speed_value
) {
    vec2 freq = freq_for_shape(base_freq, width, height);
    float inv_width = (width > 0.0) ? 1.0 / width : 0.0;
    float inv_height = (height > 0.0) ? 1.0 / height : 0.0;
    vec2 uv = vec2((pos.x + 0.5) * inv_width, (pos.y + 0.5) * inv_height);
    vec2 scaled = vec2(uv.x * freq.x, uv.y * freq.y);
    float temporal_offset = time_value * speed_value;
    vec3 sample_pos = vec3(
        scaled.x + seed.x,
        scaled.y + seed.y,
        temporal_offset + seed.z
    );
    float noise = simplex_noise(sample_pos);
    return clamp(noise * 0.5 + 0.5, 0.0, 1.0);
}

vec3 brightness_noise(
    vec2 pos,
    float width,
    float height,
    float seed_offset,
    float time_value,
    float speed_value
) {
    float base = 71.0 + seed_offset * 53.0;
    float r = animated_simplex(pos, width, height, 128.0, vec3(base * 0.17, base * 0.23, base * 0.31), time_value, speed_value);
    float g = animated_simplex(pos, width, height, 128.0, vec3(base * 0.41, base * 0.47, base * 0.53), time_value, speed_value);
    float b = animated_simplex(pos, width, height, 128.0, vec3(base * 0.59, base * 0.61, base * 0.67), time_value, speed_value);
    return clamp(vec3(r, g, b), vec3(0.0), vec3(1.0));
}

float mask_strength(vec4 mask) {
    float rgb_strength = max(mask.x, max(mask.y, mask.z));
    return max(rgb_strength, mask.w);
}

vec4 worm_mask_sample(vec2 coords) {
    vec4 worm_sample = texture(wormTexture, (coords + vec2(0.5)) / vec2(textureSize(wormTexture, 0)));
    return clamp(worm_sample, vec4(0.0), vec4(1.0));
}

vec4 worm_mask_accumulated(
    vec2 coords,
    vec2 dims,
    float time_value,
    float speed_value
) {
    // Sample the worm texture directly and normalize
    vec4 worm_sample = worm_mask_sample(coords);
    vec3 sqrt_rgb = sqrt(clamp(worm_sample.xyz, vec3(0.0), vec3(1.0)));
    float sqrt_alpha = sqrt(clamp(worm_sample.w, 0.0, 1.0));
    // Boost alpha so fresh worm trails reach full opacity quickly, aging out older ones
    float boosted_alpha = clamp(sqrt_alpha * 100.0, 0.0, 1.0);
    return vec4(sqrt_rgb, boosted_alpha);
}

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint w = to_dimension(width);
    uint h = to_dimension(height);
    
    if (w == 0u) w = uint(textureSize(inputTex, 0).x);
    if (h == 0u) h = uint(textureSize(inputTex, 0).y);

    if (global_id.x >= w || global_id.y >= h) {
        return;
    }

    vec2 coords = vec2(float(global_id.x), float(global_id.y));

    vec2 uv = (gl_FragCoord.xy - 0.5) / vec2(textureSize(inputTex, 0));
    vec4 base_sample = texture(inputTex, uv);

    vec2 mask_dims = vec2(textureSize(wormTexture, 0));
    float speed_value = max(speed, 0.0);
    float time_value = time;
    vec4 base_mask = worm_mask_accumulated(coords, mask_dims, time_value, speed_value);
    float mask_power = mask_strength(base_mask);

    vec3 accum = base_sample.xyz;
    vec2 pos = coords;
    float width_f = float(w);
    float height_f = float(h);

    // Python: tensor = value.blend(tensor, brightness, mask * 0.5)
    // Each layer uses the same worm mask sampled at the current pixel,
    // but with different brightness noise seeds and temporal offsets.
    for (uint layer = 0u; layer < 4u; layer = layer + 1u) {
        float layer_seed = float(seed) + float(layer) * 17.0;
        
        // Sample brightness noise with per-layer temporal variation
        vec3 brightness = brightness_noise(
            pos,
            width_f,
            height_f,
            layer_seed,
            time_value + float(layer) * 0.13,
            1.0 + speed_value * 0.5
        );
        
        // Use the worm mask directly (Python: mask * 0.5)
        vec3 mask_blend = clamp(base_mask.xyz * 0.5, vec3(0.0), vec3(1.0));
        
        // Linear blend: accum = mix(accum, brightness, mask_blend);
        accum = mix(accum, brightness, mask_blend);
    }

    // Blend the accumulated layers back to the source
    vec3 final_rgb = clamp(accum, vec3(0.0), vec3(1.0));

    fragColor = vec4(final_rgb, base_sample.w);
}
