/*
 * Grime - dusty speckles and grime overlay
 *
 * Multi-octave noise with self-refraction, Chebyshev derivative,
 * dropout specks, and sparse noise blended to dirty the input.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float strength;
uniform float seed;

in vec2 v_texCoord;
out vec4 fragColor;

float clamp01(float v) {
    return clamp(v, 0.0, 1.0);
}

vec2 freq_for_shape(float freq, float w, float h) {
    if (w <= 0.0 || h <= 0.0) return vec2(freq);
    if (abs(w - h) < 0.5) return vec2(freq);
    if (h < w) return vec2(freq, freq * w / h);
    return vec2(freq * h / w, freq);
}

// PCG PRNG
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

float hash21(vec2 p) {
    uvec3 v = pcg(uvec3(floatBitsToUint(p.x), floatBitsToUint(p.y), 0u));
    return float(v.x) / float(0xffffffffu);
}

float hash31(vec3 p) {
    uvec3 v = pcg(uvec3(floatBitsToUint(p.x), floatBitsToUint(p.y), floatBitsToUint(p.z)));
    return float(v.x) / float(0xffffffffu);
}

float fade(float t) {
    return t * t * (3.0 - 2.0 * t);
}

float value_noise(vec2 coord, float s) {
    vec2 cell = floor(coord);
    vec2 f = fract(coord);
    float tl = hash31(vec3(cell, s));
    float tr = hash31(vec3(cell + vec2(1.0, 0.0), s));
    float bl = hash31(vec3(cell + vec2(0.0, 1.0), s));
    float br = hash31(vec3(cell + vec2(1.0, 1.0), s));
    vec2 st = vec2(fade(f.x), fade(f.y));
    return mix(mix(tl, tr, st.x), mix(bl, br, st.x), st.y);
}

vec2 seed_offset(float s) {
    float angle = s * 0.1375;
    float radius = 0.35 * (0.25 + 0.75 * sin(s * 1.37));
    return vec2(cos(angle), sin(angle)) * radius;
}

float simple_multires(vec2 uv, vec2 base_freq, float s) {
    vec2 freq = base_freq;
    float amp = 0.5;
    float total = 0.0;
    float accum = 0.0;

    for (int i = 0; i < 8; i++) {
        float os = s + float(i) * 37.11;
        vec2 off = seed_offset(os) / freq;
        accum += value_noise(uv * freq + off, os) * amp;
        total += amp;
        freq *= 2.0;
        amp *= 0.5;
    }

    return clamp01(accum / max(total, 0.001));
}

float refracted_field(vec2 uv, vec2 base_freq, vec2 px, float disp, float s) {
    float base_mask = simple_multires(uv, base_freq, s);
    float off_mask = simple_multires(fract(uv + 0.5), base_freq, s + 19.0);

    vec2 off_vec = vec2(
        (base_mask * 2.0 - 1.0) * disp * px.x,
        (off_mask * 2.0 - 1.0) * disp * px.y
    );
    return simple_multires(fract(uv + off_vec), base_freq, s + 41.0);
}

float chebyshev_gradient(vec2 uv, vec2 base_freq, vec2 px, float disp, float s) {
    vec2 ox = vec2(px.x, 0.0);
    vec2 oy = vec2(0.0, px.y);

    float r = refracted_field(fract(uv + ox), base_freq, px, disp, s);
    float l = refracted_field(fract(uv - ox), base_freq, px, disp, s);
    float u = refracted_field(fract(uv + oy), base_freq, px, disp, s);
    float d = refracted_field(fract(uv - oy), base_freq, px, disp, s);

    float dx = (r - l) * 0.5;
    float dy = (u - d) * 0.5;
    return clamp01(max(abs(dx), abs(dy)) * 4.0);
}

float exponential_noise(vec2 uv, vec2 freq, float s) {
    vec2 off = seed_offset(s + 7.0);
    return pow(clamp01(value_noise(uv * freq + off, s + 13.0)), 4.0);
}

float refracted_exponential(vec2 uv, vec2 freq, vec2 px, float disp, float s) {
    float base = exponential_noise(uv, freq, s);
    float ox = exponential_noise(uv, freq, s + 23.0);
    float oy = exponential_noise(fract(uv + 0.5), freq, s + 47.0);

    vec2 off_vec = vec2(
        (ox * 2.0 - 1.0) * disp * px.x,
        (oy * 2.0 - 1.0) * disp * px.y
    );
    float warped = exponential_noise(fract(uv + off_vec), freq, s + 59.0);
    return clamp01((base + warped) * 0.5);
}

void main() {
    vec2 dims = max(resolution, vec2(1.0));
    vec2 px = 1.0 / dims;
    vec2 uv = v_texCoord;
    vec4 base_color = texture(inputTex, uv);

    float str = max(strength, 0.0);
    float s = seed;

    // Multi-octave noise mask, self-refracted
    vec2 freq_mask = freq_for_shape(5.0, dims.x, dims.y);
    float mask_refracted = refracted_field(uv, freq_mask, px, 1.0, s + 11.0);
    float mask_gradient = chebyshev_gradient(uv, freq_mask, px, 1.0, s + 11.0);
    float mask_value = clamp01(mix(mask_refracted, mask_gradient, 0.125));

    // Blend input with dark dust using squared mask
    float mask_power = clamp01(mask_value * mask_value * 0.4);
    vec3 dusty = mix(base_color.rgb, vec3(0.15), mask_power);

    // Speck overlay: dropout + exponential noise, refracted
    vec2 freq_specks = dims * 0.1;
    float dropout = hash21(uv * dims + vec2(s + 37.0, s * 1.37)) < 0.4 ? 1.0 : 0.0;
    float specks_field = refracted_exponential(uv, freq_specks, px, 0.25, s + 71.0) * dropout;
    float trimmed = clamp01((specks_field - 0.3) / 0.7);
    float specks = 1.0 - sqrt(trimmed);

    // Sparse noise
    float sparse_mask = hash21(uv * dims + vec2(s + 113.0, s + 171.0)) < 0.25 ? 1.0 : 0.0;
    float sparse_noise = exponential_noise(uv, dims, s + 131.0) * sparse_mask;

    // Combine
    dusty = mix(dusty, vec3(sparse_noise), 0.15);
    dusty *= specks;

    // Final blend: mix input toward dusty layer using mask * strength
    float blend_mask = clamp01(mask_value * str);
    vec3 final_rgb = mix(base_color.rgb, dusty, blend_mask);

    fragColor = vec4(clamp(final_rgb, 0.0, 1.0), base_color.a);
}
