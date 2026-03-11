#version 300 es

precision highp float;
precision highp int;

// Texture effect: generate animated ridged noise, derive a shadow from the
// noise gradient, then blend that shade back into the source pixels.

uniform sampler2D inputTex;
uniform float time;
uniform float alpha;
uniform float scale;

in vec2 v_texCoord;
out vec4 fragColor;

const float INV_UINT32_MAX = 1.0 / 4294967295.0;
const int OCTAVE_COUNT = 3;
const int Z_LOOP = 2;
const float SHADE_GAIN = 4.4;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float fade(float t) {
    return t * t * (3.0 - 2.0 * t);
}

vec2 freq_for_shape(float base_freq, vec2 dims) {
    float w = max(dims.x, 1.0);
    float h = max(dims.y, 1.0);
    if (abs(w - h) < 0.5) {
        return vec2(base_freq, base_freq);
    }
    if (w > h) {
        return vec2(base_freq, base_freq * w / h);
    }
    return vec2(base_freq * h / w, base_freq);
}

// Simple hash function for integers
uint hash_uint(uint x) {
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

float fast_hash(ivec3 p, uint salt) {
    uint h = salt ^ 0x9e3779b9u;
    h ^= uint(p.x) * 0x27d4eb2du;
    h = hash_uint(h);
    h ^= uint(p.y) * 0xc2b2ae35u;
    h = hash_uint(h);
    h ^= uint(p.z) * 0x165667b1u;
    h = hash_uint(h);
    return float(h) * INV_UINT32_MAX;
}

float value_noise(vec2 uv, vec2 freq, float motion, uint salt) {
    vec2 scaled_uv = uv * max(freq, vec2(1.0, 1.0));
    vec2 cell_floor = floor(scaled_uv);
    vec2 frac_part = fract(scaled_uv);
    ivec2 base_cell = ivec2(cell_floor);

    float z_floor = floor(motion);
    float z_frac = fract(motion);
    int z0 = int(z_floor) % Z_LOOP;
    int z1 = (z0 + 1) % Z_LOOP;

    float c000 = fast_hash(ivec3(base_cell.x + 0, base_cell.y + 0, z0), salt);
    float c100 = fast_hash(ivec3(base_cell.x + 1, base_cell.y + 0, z0), salt);
    float c010 = fast_hash(ivec3(base_cell.x + 0, base_cell.y + 1, z0), salt);
    float c110 = fast_hash(ivec3(base_cell.x + 1, base_cell.y + 1, z0), salt);
    float c001 = fast_hash(ivec3(base_cell.x + 0, base_cell.y + 0, z1), salt);
    float c101 = fast_hash(ivec3(base_cell.x + 1, base_cell.y + 0, z1), salt);
    float c011 = fast_hash(ivec3(base_cell.x + 0, base_cell.y + 1, z1), salt);
    float c111 = fast_hash(ivec3(base_cell.x + 1, base_cell.y + 1, z1), salt);

    float tx = fade(frac_part.x);
    float ty = fade(frac_part.y);
    float tz = fade(z_frac);

    float x00 = mix(c000, c100, tx);
    float x10 = mix(c010, c110, tx);
    float x01 = mix(c001, c101, tx);
    float x11 = mix(c011, c111, tx);

    float y0 = mix(x00, x10, ty);
    float y1 = mix(x01, x11, ty);

    return mix(y0, y1, tz);
}

float multi_octave_noise(vec2 uv, vec2 base_freq, float motion) {
    vec2 freq = max(base_freq, vec2(1.0, 1.0));
    float amplitude = 0.5;
    float accum = 0.0;
    float total = 0.0;

    for (int octave = 0; octave < OCTAVE_COUNT; octave++) {
        uint salt = 0x9e3779b9u * uint(octave + 1);
        float samp = value_noise(uv, freq, motion + float(octave) * 0.37, salt);
        float ridged = 1.0 - abs(samp * 2.0 - 1.0);
        accum += ridged * amplitude;
        total += amplitude;
        freq *= 2.0;
        amplitude *= 0.55;
    }

    if (total <= 0.0) {
        return clamp01(accum);
    }
    return clamp01(accum / total);
}

void main() {
    vec4 base_color = texture(inputTex, v_texCoord);
    vec2 dims = vec2(textureSize(inputTex, 0));
    vec2 pixel_step = 1.0 / dims;

    float a = clamp(alpha, 0.0, 1.0);
    if (a <= 0.0) {
        fragColor = base_color;
        return;
    }

    vec2 base_freq = freq_for_shape(24.0 * scale, dims);
    float motion = time * float(Z_LOOP);

    float noise_center = multi_octave_noise(v_texCoord, base_freq, motion);
    float noise_right = multi_octave_noise(v_texCoord + vec2(pixel_step.x, 0.0), base_freq, motion);
    float noise_left = multi_octave_noise(v_texCoord - vec2(pixel_step.x, 0.0), base_freq, motion);
    float noise_up = multi_octave_noise(v_texCoord + vec2(0.0, pixel_step.y), base_freq, motion);
    float noise_down = multi_octave_noise(v_texCoord - vec2(0.0, pixel_step.y), base_freq, motion);

    float gx = noise_right - noise_left;
    float gy = noise_down - noise_up;
    float gradient = sqrt(gx * gx + gy * gy);
    float shade_base = clamp01(gradient * SHADE_GAIN * 0.25);

    float highlight_mix = clamp01((shade_base * shade_base) * 1.25);
    float base_factor = 0.9 + noise_center * 0.35;
    float factor = clamp(base_factor + highlight_mix * 0.35, 0.85, 1.6);

    vec3 scaled_rgb = clamp(base_color.rgb * factor, 0.0, 1.0);

    fragColor = vec4(mix(base_color.rgb, scaled_rgb, a), base_color.a);
}
