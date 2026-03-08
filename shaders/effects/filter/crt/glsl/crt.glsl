#version 300 es

precision highp float;
precision highp int;

// CRT effect - faithful port of Python implementation
// Applies scanlines, lens warp, chromatic aberration, hue shift, saturation boost, and vignette

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;
const float INV_THREE = 0.3333333333333333;


uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform float speed;

uint as_u32(float value) {
    return uint(max(value, 0.0));
}

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float random_scalar(float seed) {
    return fract(sin(seed) * 43758.5453123);
}

float simplex_random(float time, float speed) {
    float angle = time * TAU;
    float z = cos(angle) * speed;
    float w = sin(angle) * speed;
    return fract(sin(z * 157.0 + w * 113.0) * 43758.5453);
}

vec2 freq_for_shape(float base_freq, float width, float height) {
    float freq = max(base_freq, 1.0);
    float width_safe = max(width, 1.0);
    float height_safe = max(height, 1.0);

    if (abs(width_safe - height_safe) < 1e-5) {
        return vec2(freq, freq);
    }

    if (height_safe < width_safe) {
        float scaled = floor(freq * width_safe / height_safe);
        return vec2(freq, max(scaled, 1.0));
    }

    float scaled = floor(freq * height_safe / width_safe);
    return vec2(max(scaled, 1.0), freq);
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
    vec4 p = permute(
        permute(
            permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0)
        )
        + i.x + vec4(0.0, i1.x, i2.x, 1.0)
    );

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

float animated_simplex_value(vec2 uv, float time, float speed) {
    float angle = time * TAU;
    float z_base = cos(angle) * speed;
    vec3 base_seed = vec3(17.0, 29.0, 47.0);
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

vec2 compute_lens_offsets(
    vec2 sample_pos,
    float width,
    float height,
    vec2 freq,
    float time,
    float speed,
    float displacement
) {
    float width_safe = max(width, 1.0);
    float height_safe = max(height, 1.0);
    float freq_x = max(freq.y, 1.0);
    float freq_y = max(freq.x, 1.0);

    vec2 wrapped_pos = vec2(
        wrap_float(sample_pos.x, width_safe),
        wrap_float(sample_pos.y, height_safe)
    );
    vec2 uv = vec2(
        (wrapped_pos.x / width_safe) * freq_x,
        (wrapped_pos.y / height_safe) * freq_y
    );

    float noise_value = animated_simplex_value(uv, time, speed);

    vec2 uv_centered = (wrapped_pos + vec2(0.5, 0.5)) / vec2(width_safe, height_safe);
    float mask = singularity_mask(uv_centered, width_safe, height_safe);
    float distortion = (noise_value * 2.0 - 1.0) * mask;
    float angle = distortion * TAU;

    vec2 offsets = vec2(cos(angle), sin(angle))
        * displacement * vec2(width_safe, height_safe);
    return offsets;
}

// Value noise implementation
float fade(float value) {
    return value * value * (3.0 - 2.0 * value);
}

vec3 fade_vec3(vec3 v) {
    return vec3(fade(v.x), fade(v.y), fade(v.z));
}

float lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

float hash3(ivec3 coord, float seed) {
    vec3 base = vec3(coord);
    float dot_value = dot(base, vec3(12.9898, 78.233, 37.719)) + seed * 0.001;
    return fract(sin(dot_value) * 43758.5453);
}

float value_noise_3d(vec3 coord, float seed) {
    vec3 cell = vec3(floor(coord));
    ivec3 cell_i = ivec3(cell);
    vec3 local = fract(coord);
    vec3 smooth_t = fade_vec3(local);

    float c000 = hash3(cell_i, seed);
    float c100 = hash3(cell_i + ivec3(1, 0, 0), seed);
    float c010 = hash3(cell_i + ivec3(0, 1, 0), seed);
    float c110 = hash3(cell_i + ivec3(1, 1, 0), seed);
    float c001 = hash3(cell_i + ivec3(0, 0, 1), seed);
    float c101 = hash3(cell_i + ivec3(1, 0, 1), seed);
    float c011 = hash3(cell_i + ivec3(0, 1, 1), seed);
    float c111 = hash3(cell_i + ivec3(1, 1, 1), seed);

    float x00 = lerp(c000, c100, smooth_t.x);
    float x10 = lerp(c010, c110, smooth_t.x);
    float x01 = lerp(c001, c101, smooth_t.x);
    float x11 = lerp(c011, c111, smooth_t.x);
    float y0 = lerp(x00, x10, smooth_t.y);
    float y1 = lerp(x01, x11, smooth_t.y);
    return lerp(y0, y1, smooth_t.z);
}

// Singularity (radial distance from center)
float compute_singularity(float x, float y, float width, float height) {
    float center_x = width * 0.5;
    float center_y = height * 0.5;
    float dx = (x - center_x) / width;
    float dy = (y - center_y) / height;
    return length(vec2(dx, dy));
}

// Helper functions for color space conversion and adjustments
float wrap_unit(float value) {
    float wrapped = value - floor(value);
    if (wrapped < 0.0) {
        wrapped = wrapped + 1.0;
    }
    return wrapped;
}

float blend_linear(float a, float b, float t) {
    return mix(a, b, clamp(t, 0.0, 1.0));
}

float blend_cosine(float a, float b, float value) {
    float clamped = clamp(value, 0.0, 1.0);
    float weight = (1.0 - cos(clamped * PI)) * 0.5;
    return mix(a, b, weight);
}

uint clamp_index(float value, float max_index) {
    if (max_index <= 0.0) {
        return 0u;
    }
    float clamped = clamp(value, 0.0, max_index);
    return uint(clamped);
}

vec3 rgb_to_hsv(vec3 rgb) {
    float c_max = max(max(rgb.x, rgb.y), rgb.z);
    float c_min = min(min(rgb.x, rgb.y), rgb.z);
    float delta = c_max - c_min;

    float hue = 0.0;
    if (delta > 0.0) {
        if (c_max == rgb.x) {
            float segment = (rgb.y - rgb.z) / delta;
            if (segment < 0.0) {
                segment = segment + 6.0;
            }
            hue = segment;
        } else if (c_max == rgb.y) {
            hue = ((rgb.z - rgb.x) / delta) + 2.0;
        } else {
            hue = ((rgb.x - rgb.y) / delta) + 4.0;
        }
        hue = wrap_unit(hue / 6.0);
    }

    float saturation = (c_max != 0.0) ? (delta / c_max) : 0.0;
    return vec3(hue, saturation, c_max);
}

vec3 hsv_to_rgb(vec3 hsv) {
    float h = hsv.x;
    float s = hsv.y;
    float v = hsv.z;

    float dh = h * 6.0;
    float r_comp = clamp01(abs(dh - 3.0) - 1.0);
    float g_comp = clamp01(-abs(dh - 2.0) + 2.0);
    float b_comp = clamp01(-abs(dh - 4.0) + 2.0);

    float one_minus_s = 1.0 - s;
    float sr = s * r_comp;
    float sg = s * g_comp;
    float sb = s * b_comp;

    float r = clamp01((one_minus_s + sr) * v);
    float g = clamp01((one_minus_s + sg) * v);
    float b = clamp01((one_minus_s + sb) * v);

    return vec3(r, g, b);
}

vec3 adjust_hue(vec3 color, float amount) {
    vec3 hsv = rgb_to_hsv(color);
    hsv.x = wrap_unit(hsv.x + amount);
    hsv.y = clamp01(hsv.y);
    hsv.z = clamp01(hsv.z);
    return clamp(vec3(hsv_to_rgb(hsv)), vec3(0.0), vec3(1.0));
}

vec3 adjust_saturation(vec3 color, float amount) {
    vec3 hsv = rgb_to_hsv(color);
    hsv.y = clamp01(hsv.y * amount);
    hsv.z = clamp01(hsv.z);
    return clamp(vec3(hsv_to_rgb(hsv)), vec3(0.0), vec3(1.0));
}

float apply_vignette(float value, float brightness, float mask, float alpha) {
    float edge_mix = mix(value, brightness, mask);
    return mix(value, edge_mix, clamp(alpha, 0.0, 1.0));
}

// Generate base scanline values (2x1 noise pattern)
vec2 get_scanline_base_values(float time, float speed) {
    float time_scaled = time * speed * 0.1;
    float noise0 = value_noise_3d(vec3(0.0, 0.0, time_scaled), 19.37);
    float noise1 = value_noise_3d(vec3(1.0, 0.0, time_scaled), 19.37);
    return vec2(noise0, noise1);
}

// Get interpolated scanline value for a given y coordinate
// The scanline pattern is based on Y position to create horizontal lines
float get_scanline_value_interpolated(float y, float height, vec2 base_values) {
    // Goal: ~500 bars for 1000px image = ~2px per bar, increased by 25% = 2.5px per bar
    // Each bar alternates between the 2 base values
    float pixels_per_bar = 2.5;
    float y_scaled = y / pixels_per_bar;
    int scanline_index = int(floor(y_scaled)) % 2;
    
    return (scanline_index == 0 ? base_values.x : base_values.y);
}

// Sample scanline with bilinear interpolation at fractional coordinates
float sample_scanline_bilinear(float sample_x, float sample_y, float width, float height, vec2 base_values) {
    // Wrap coordinates
    float wrapped_x = sample_x - floor(sample_x / width) * width;
    float wrapped_y = sample_y - floor(sample_y / height) * height;
    
    if (wrapped_x < 0.0) { wrapped_x = wrapped_x + width; }
    if (wrapped_y < 0.0) { wrapped_y = wrapped_y + height; }
    
    wrapped_x = clamp(wrapped_x, 0.0, width - 1.0);
    wrapped_y = clamp(wrapped_y, 0.0, height - 1.0);
    
    // Bilinear interpolation
    float x0 = floor(wrapped_x);
    float y0 = floor(wrapped_y);
    float x1 = min(x0 + 1.0, width - 1.0);
    float y1 = min(y0 + 1.0, height - 1.0);
    
    float x_fract = clamp(wrapped_x - x0, 0.0, 1.0);
    float y_fract = clamp(wrapped_y - y0, 0.0, 1.0);
    
    // Get scanline values at the 4 corners
    float val_x0_y0 = get_scanline_value_interpolated(y0, height, base_values);
    float val_x1_y0 = get_scanline_value_interpolated(y0, height, base_values);
    float val_x0_y1 = get_scanline_value_interpolated(y1, height, base_values);
    float val_x1_y1 = get_scanline_value_interpolated(y1, height, base_values);
    
    // Bilinear blend
    float val_y0 = mix(val_x0_y0, val_x1_y0, x_fract);
    float val_y1 = mix(val_x0_y1, val_x1_y1, x_fract);
    
    return mix(val_y0, val_y1, y_fract);
}


out vec4 fragColor;

void main() {
    uvec3 global_id = uvec3(uint(gl_FragCoord.x), uint(gl_FragCoord.y), 0u);

    uint width = as_u32(resolution.x);
    uint height = as_u32(resolution.y);
    if (global_id.x >= width || global_id.y >= height) {
        return;
    }

    float width_f = max(resolution.x, 1.0);
    float height_f = max(resolution.y, 1.0);
    float time = time;
    float speed = speed;
    float x = float(global_id.x);
    float y = float(global_id.y);

    float displacement = 0.0625;
    vec2 freq = freq_for_shape(2.0, width_f, height_f);
    vec2 base_offsets = compute_lens_offsets(
        vec2(x, y),
        width_f,
        height_f,
        freq,
        time,
        speed,
        displacement
    );

    // Step 2: Sample the procedural scanline texture at the WARPED coordinates.
    // This correctly applies the lens warp to the scanlines.
    vec2 scanline_base = get_scanline_base_values(time, speed);
    float scan_value = sample_scanline_bilinear(x + base_offsets.x, y + base_offsets.y, width_f, height_f, scanline_base);

    // Step 3: Sample the input texture at the ORIGINAL, un-warped coordinates.
    vec3 base_color = texelFetch(inputTex, ivec2(int(x), int(y)), 0).xyz;

    // Step 4: Blend the original input color with the warped scanlines.
    vec3 color = mix(
        base_color,
        (base_color + scan_value) * scan_value,
        0.5
    );
    color = clamp(color, vec3(0.0), vec3(1.0));
    
    // Step 5: Chromatic aberration, hue shift, saturation, and vignette
    if (4.0 >= 2.5) { // channels == 3
        float seed_base = 17.0;
        float displacement_base = 0.0125 + random_scalar(seed_base + 0.37) * 0.00625;
        float simplex_value = random_scalar(seed_base + 0.73);
        float displacement_pixels = displacement_base * width_f * simplex_value;
        
        float singularity = compute_singularity(x, y, width_f, height_f);
        float aber_mask = pow(singularity, 3.0);
        float gradient = clamp(x / (width_f - 1.0), 0.0, 1.0);
        
        float hue_shift = random_scalar(seed_base + 1.91) * 0.25 - 0.125;
        
        // Red channel sample point (aberration shift)
        float red_x = min(x + displacement_pixels, width_f - 1.0);
        red_x = blend_linear(red_x, x, gradient);
        float red_sample_x = blend_cosine(x, red_x, aber_mask);
        
        vec3 red_base_col = texelFetch(inputTex, ivec2(int(red_sample_x), int(y)), 0).xyz;
        vec2 red_offsets = compute_lens_offsets(
            vec2(red_sample_x, y),
            width_f,
            height_f,
            freq,
            time,
            speed,
            displacement
        );
        float red_scan_val = sample_scanline_bilinear(red_sample_x + red_offsets.x, y + red_offsets.y, width_f, height_f, scanline_base);
        vec3 red_blended = mix(red_base_col, (red_base_col + red_scan_val) * red_scan_val, 0.5);

        // Green channel is the original computed color for this pixel
        vec3 green_blended = color;

        // Blue channel sample point (aberration shift)
        float blue_x = max(x - displacement_pixels, 0.0);
        blue_x = blend_linear(x, blue_x, gradient);
        float blue_sample_x = blend_cosine(x, blue_x, aber_mask);

        vec3 blue_base_col = texelFetch(inputTex, ivec2(int(blue_sample_x), int(y)), 0).xyz;
        vec2 blue_offsets = compute_lens_offsets(
            vec2(blue_sample_x, y),
            width_f,
            height_f,
            freq,
            time,
            speed,
            displacement
        );
        float blue_scan_val = sample_scanline_bilinear(blue_sample_x + blue_offsets.x, y + blue_offsets.y, width_f, height_f, scanline_base);
        vec3 blue_blended = mix(blue_base_col, (blue_base_col + blue_scan_val) * blue_scan_val, 0.5);

        // Combine, applying hue shift to each component before assembling
        color = vec3(
            adjust_hue(red_blended, hue_shift).r,
            adjust_hue(green_blended, hue_shift).g,
            adjust_hue(blue_blended, hue_shift).b
        );
        
        // Restore original hue
        color = adjust_hue(color, -hue_shift);
        
        // Step 6: Saturation boost
        color = adjust_saturation(color, 1.125);
        
        // Step 7: Vignette
        float vignette_alpha = random_scalar(seed_base + 3.17) * 0.175;
        float vignette_mask = singularity;
        color.x = apply_vignette(color.x, 0.0, vignette_mask, vignette_alpha);
        color.y = apply_vignette(color.y, 0.0, vignette_mask, vignette_alpha);
        color.z = apply_vignette(color.z, 0.0, vignette_mask, vignette_alpha);
    }
    
    // Step 8: Normalize (contrast adjustment around mean)
    float local_mean = (color.x + color.y + color.z) * INV_THREE;
    color = clamp((color - local_mean) * 1.25 + local_mean, vec3(0.0), vec3(1.0));
    
    // Write output
    fragColor = vec4(color.x, color.y, color.z, 1.0);
}