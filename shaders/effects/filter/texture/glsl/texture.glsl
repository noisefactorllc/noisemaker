#version 300 es

precision highp float;
precision highp int;

// Texture effect: generate a height field from one of several texture modes,
// derive shading from the gradient, then blend back into the source pixels.
// Modes: 0=canvas, 1=crosshatch, 2=halftone, 3=paper, 4=stucco
//
// MODE is a compile-time define injected by the runtime (see definition.js
// `globals.mode.define`). Compile-time specialization matters here because
// height_field() is called 5 times per pixel (center + 4 neighbors for the
// gradient). With a runtime int dispatch, ANGLE inlines all 5 variant height
// functions at each call site — 25 variant inlines per pixel. Baking MODE
// lets the compiler emit only the active variant (5 inlines of one function).
#ifndef MODE
#define MODE 3
#endif

uniform sampler2D inputTex;
uniform float time;
uniform float alpha;
uniform float scale;
uniform float intensity;
uniform float contrast;
uniform bool mono;
uniform vec2 tileOffset;
uniform vec2 fullResolution;

in vec2 v_texCoord;
out vec4 fragColor;

const float PI = 3.14159265359;
const float INV_UINT32_MAX = 1.0 / 4294967295.0;
const int Z_LOOP = 2;
const float SHADE_GAIN = 4.4;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float s_curve01(float value) {
    float c = clamp01(value);
    return c * c * (3.0 - 2.0 * c);
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

// Paper: 3-octave ridged noise (original texture)
float height_paper(vec2 uv, vec2 base_freq, float motion) {
    vec2 freq = max(base_freq, vec2(1.0, 1.0));
    float amplitude = 0.5;
    float accum = 0.0;
    float total = 0.0;

    for (int octave = 0; octave < 3; octave++) {
        uint salt = 0x9e3779b9u * uint(octave + 1);
        float samp = value_noise(uv, freq, motion + float(octave) * 0.37, salt);
        float ridged = 1.0 - abs(samp * 2.0 - 1.0);
        accum += ridged * amplitude;
        total += amplitude;
        freq *= 2.0;
        amplitude *= 0.55;
    }

    return total > 0.0 ? clamp01(accum / total) : clamp01(accum);
}

// Stucco: 2-octave smooth noise, lower frequency, rounder bumps
float height_stucco(vec2 uv, vec2 base_freq, float motion) {
    vec2 freq = max(base_freq, vec2(1.0, 1.0));
    float amplitude = 0.5;
    float accum = 0.0;
    float total = 0.0;

    for (int octave = 0; octave < 2; octave++) {
        uint salt = 0x9e3779b9u * uint(octave + 1);
        float samp = value_noise(uv, freq, motion + float(octave) * 0.37, salt);
        accum += samp * amplitude;
        total += amplitude;
        freq *= 2.0;
        amplitude *= 0.5;
    }

    return total > 0.0 ? clamp01(accum / total) : clamp01(accum);
}

// Canvas: woven fabric pattern with slight noise perturbation
float height_canvas(vec2 uv, vec2 base_freq, float motion) {
    vec2 st = uv * base_freq;
    float warpX = abs(sin(st.x * PI));
    float weftY = abs(sin(st.y * PI));
    float weave = warpX * weftY;

    // Add subtle noise irregularity
    float noise = value_noise(uv, base_freq * 0.5, motion, 0x12345678u);
    return clamp01(weave * 0.85 + noise * 0.15);
}

// Halftone: regular circular dot grid
float height_halftone(vec2 uv, vec2 base_freq) {
    vec2 st = uv * base_freq;
    vec2 cell = fract(st) - 0.5;
    float dot = 1.0 - clamp01(length(cell) * 3.0);
    return dot * dot;
}

// Crosshatch: two overlapping diagonal sine ridges
float height_crosshatch(vec2 uv, vec2 base_freq) {
    vec2 st = uv * base_freq;
    float d1 = abs(sin((st.x + st.y) * PI));
    float d2 = abs(sin((st.x - st.y) * PI));
    return clamp01(d1 * d2);
}

// Dispatch to the active mode's height function — single variant selected
// at compile time by the MODE define.
float height_field(vec2 uv, vec2 base_freq, float motion) {
#if MODE == 0
    return height_canvas(uv, base_freq, motion);
#elif MODE == 1
    return height_crosshatch(uv, base_freq);
#elif MODE == 2
    return height_halftone(uv, base_freq);
#elif MODE == 4
    return height_stucco(uv, base_freq, motion);
#else
    return height_paper(uv, base_freq, motion);  // 3 = paper (default)
#endif
}

uint material_hash(ivec2 p, uint salt, uint layer) {
    uint h = salt ^ (layer * 0x9e3779b9u);
    h ^= uint(p.x) * 0x27d4eb2du;
    h = hash_uint(h);
    h ^= uint(p.y) * 0xc2b2ae35u;
    return hash_uint(h);
}

vec2 material_gradient(ivec2 p, uint salt, uint layer) {
    uint h = material_hash(p, salt, layer);
    vec2 gradient = vec2(float(h & 0xffffu), float(h >> 16u)) * (2.0 / 65535.0) - 1.0;
    return gradient * inversesqrt(max(dot(gradient, gradient), 0.000001));
}

vec2 material_fade(vec2 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float material_gradient_layer(vec2 p, uint salt, uint layer) {
    ivec2 cell = ivec2(floor(p));
    vec2 local = fract(p);
    float n00 = dot(material_gradient(cell, salt, layer), local);
    float n10 = dot(material_gradient(cell + ivec2(1, 0), salt, layer), local - vec2(1.0, 0.0));
    float n01 = dot(material_gradient(cell + ivec2(0, 1), salt, layer), local - vec2(0.0, 1.0));
    float n11 = dot(material_gradient(cell + ivec2(1, 1), salt, layer), local - vec2(1.0, 1.0));
    vec2 blend = material_fade(local);
    return mix(mix(n00, n10, blend.x), mix(n01, n11, blend.x), blend.y);
}

float material_noise(vec2 globalPixel, vec2 cellSize, float motion, uint salt) {
    vec2 p = globalPixel / max(cellSize, vec2(0.5));
    float zFloor = floor(motion);
    int z0 = int(zFloor) % Z_LOOP;
    int z1 = (z0 + 1) % Z_LOOP;
    float n0 = material_gradient_layer(p, salt, uint(z0));
    float n1 = material_gradient_layer(p, salt, uint(z1));
    float n = mix(n0, n1, material_fade(vec2(fract(motion))).x);
    return clamp01(0.5 + n * 0.72);
}

float material_soft(vec2 globalPixel, float motion, uint salt, float size) {
    // Two incommensurate gradient fields make a smooth isotropic surface.
    // Quintic interpolation keeps enlarged cells continuous without exposing
    // the square lattice that value noise reveals at high scale.
    vec2 primaryCell = vec2(max(size * 3.25, 1.5));
    float primary = material_noise(globalPixel, primaryCell, motion, salt);
    float secondary = material_noise(globalPixel + vec2(17.31, 29.17), primaryCell * 1.87,
        motion + 0.41, salt ^ 0x68bc21ebu);
    return primary * 0.68 + secondary * 0.32;
}

float material_directional(vec2 globalPixel, float motion, uint salt, float size) {
    // Strongly anisotropic gradient fields create continuous fibers directly,
    // avoiding both a stretched square lattice and a costly multi-tap blur.
    vec2 primaryCell = vec2(max(size * 22.0, 8.0), max(size * 2.0, 1.25));
    vec2 secondaryCell = vec2(max(size * 37.0, 13.0), max(size * 3.7, 2.3));
    float primary = material_noise(globalPixel, primaryCell, motion, salt);
    float secondary = material_noise(globalPixel + vec2(19.37, 11.83), secondaryCell,
        motion + 0.41, salt ^ 0x68bc21ebu);
    return primary * 0.72 + secondary * 0.28;
}

float material_sprinkles(vec2 globalPixel, float motion, uint salt, float size) {
    vec2 p = globalPixel / max(4.0 * size, 1.0) + vec2(motion * 0.31, motion * 0.19);
    ivec2 baseCell = ivec2(floor(p));
    vec2 local = fract(p);
    float nearest = 10.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            ivec2 cell = baseCell + ivec2(x, y);
            float jx = fast_hash(ivec3(cell, 0), salt) - 0.5;
            float jy = fast_hash(ivec3(cell, 1), salt ^ 0x68bc21ebu) - 0.5;
            vec2 point = vec2(float(x), float(y)) + 0.5 + vec2(jx, jy) * 0.6;
            nearest = min(nearest, length(local - point));
        }
    }
    return mix(0.45, 1.0, 1.0 - smoothstep(0.10, 0.22, nearest));
}

float material_edge_mask(vec2 uv, vec2 pixelStep) {
    float l = dot(texture(inputTex, uv - vec2(pixelStep.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
    float r = dot(texture(inputTex, uv + vec2(pixelStep.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
    float d = dot(texture(inputTex, uv - vec2(0.0, pixelStep.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
    float u = dot(texture(inputTex, uv + vec2(0.0, pixelStep.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
    return clamp(length(vec2(r - l, u - d)) * 6.0, 0.0, 1.0);
}

float material_value(vec2 globalPixel, vec2 dims, vec2 uv, float motion, uint salt) {
    float size = max(scale, 0.1);
#if MODE == 6
    return material_soft(globalPixel, motion, salt, size);
#elif MODE == 7
    return material_sprinkles(globalPixel, motion, salt, size);
#elif MODE == 8
    float a = material_noise(globalPixel, vec2(13.0 * size), motion, salt);
    float b = material_noise(globalPixel, vec2(6.0 * size), motion + 0.31, salt ^ 0x9e3779b9u);
    float c = material_noise(globalPixel, vec2(2.5 * size), motion + 0.67, salt ^ 0x85ebca6bu);
    return a * 0.58 + b * 0.28 + c * 0.14;
#elif MODE == 9
    float n = material_noise(globalPixel, vec2(max(size * 1.5, 0.8)), motion, salt);
    return s_curve01(s_curve01(n));
#elif MODE == 10
    return material_noise(globalPixel, vec2(4.5 * size), motion, salt);
#elif MODE == 11
    return step(0.5, material_noise(globalPixel, vec2(max(size * 1.5, 0.8)), motion, salt));
#elif MODE == 12
    return material_directional(globalPixel, motion, salt, size);
#elif MODE == 13
    return material_directional(globalPixel.yx, motion, salt, size);
#elif MODE == 14
    float n = material_noise(globalPixel, vec2(max(size * 1.5, 0.8)), motion, salt);
    return mix(0.5, n, material_edge_mask(uv, 1.0 / dims));
#else
    return material_noise(globalPixel, vec2(max(size * 1.5, 0.8)), motion, salt);
#endif
}

float shape_material(float raw) {
    float amount = intensity / 40.0;
    float shaped = raw * amount + 0.5 * (1.0 - amount);
    float c = clamp(contrast / 100.0, 0.0, 1.0);
    if (c < 0.5) return mix(0.5, shaped, c * 2.0);
    return mix(shaped, s_curve01(shaped), (c - 0.5) * 2.0);
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

#if MODE >= 5
    vec2 globalDims = fullResolution.x > 0.0 ? fullResolution : dims;
    vec2 globalPixel = gl_FragCoord.xy + tileOffset;
    float materialMotion = time * float(Z_LOOP);
    float r = shape_material(material_value(globalPixel, globalDims, v_texCoord, materialMotion, 0x1234abcdu));
    vec3 material = vec3(r);
    if (!mono) {
        material.g = shape_material(material_value(globalPixel, globalDims, v_texCoord, materialMotion, 0x68bc21ebu));
        material.b = shape_material(material_value(globalPixel, globalDims, v_texCoord, materialMotion, 0x02e5be93u));
    }
    fragColor = vec4(clamp(mix(base_color.rgb, material, a), 0.0, 1.0), base_color.a);
    return;
#endif

    // Paper and stucco use different base frequencies
#if MODE == 4
    float freq_scale = 48.0;
#else
    float freq_scale = 24.0;
#endif
    vec2 base_freq = freq_for_shape(freq_scale * (10.01 - scale), dims);
    float motion = time * float(Z_LOOP);

    // Sample height field at center and 4 neighbors for gradient
    float h_center = height_field(v_texCoord, base_freq, motion);
    float h_right  = height_field(v_texCoord + vec2(pixel_step.x, 0.0), base_freq, motion);
    float h_left   = height_field(v_texCoord - vec2(pixel_step.x, 0.0), base_freq, motion);
    float h_up     = height_field(v_texCoord + vec2(0.0, pixel_step.y), base_freq, motion);
    float h_down   = height_field(v_texCoord - vec2(0.0, pixel_step.y), base_freq, motion);

    float gx = h_right - h_left;
    float gy = h_down - h_up;
    float gradient = sqrt(gx * gx + gy * gy);

    // Stucco uses stronger shading for more pronounced bumps
#if MODE == 4
    float gain = SHADE_GAIN * 0.5;
#else
    float gain = SHADE_GAIN * 0.25;
#endif
    float shade_base = clamp01(gradient * gain);

    float highlight_mix = clamp01((shade_base * shade_base) * 1.25);
    float base_factor = 0.9 + h_center * 0.35;
    float factor = clamp(base_factor + highlight_mix * 0.35, 0.85, 1.6);

    vec3 scaled_rgb = clamp(base_color.rgb * factor, 0.0, 1.0);

    fragColor = vec4(mix(base_color.rgb, scaled_rgb, a), base_color.a);
}
