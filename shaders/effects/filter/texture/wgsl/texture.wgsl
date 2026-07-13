// Texture effect: generate a height field from one of several texture modes,
// derive shading from the gradient, then blend back into the source pixels.
// Modes: 0=canvas, 1=crosshatch, 2=halftone, 3=paper, 4=stucco
//
// MODE is a compile-time const injected by the runtime via injectDefines
// (see definition.js `globals.mode.define`). Same fix as the GLSL backend —
// collapses the 5-way height_field dispatch so Dawn constant-folds it and
// emits only one variant body per compiled program. The old `mode` binding
// at @group(0) @binding(2) is removed; bindings 3/4/5 keep their original
// indices (WGSL binding numbers don't need to be contiguous).

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> alpha: f32;
@group(0) @binding(4) var<uniform> scale: f32;
@group(0) @binding(5) var<uniform> time: f32;
@group(0) @binding(6) var<uniform> intensity: f32;
@group(0) @binding(7) var<uniform> contrast: f32;
@group(0) @binding(8) var<uniform> mono: i32;
@group(0) @binding(9) var<uniform> tileOffset: vec2<f32>;
@group(0) @binding(10) var<uniform> fullResolution: vec2<f32>;

const PI: f32 = 3.14159265359;
const INV_UINT32_MAX: f32 = 1.0 / 4294967295.0;
const Z_LOOP: i32 = 2;
const SHADE_GAIN: f32 = 4.4;

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn s_curve01(value: f32) -> f32 {
    let c: f32 = clamp01(value);
    return c * c * (3.0 - 2.0 * c);
}

fn fade(t: f32) -> f32 {
    return t * t * (3.0 - 2.0 * t);
}

fn freq_for_shape(base_freq: f32, dims: vec2<f32>) -> vec2<f32> {
    let w: f32 = max(dims.x, 1.0);
    let h: f32 = max(dims.y, 1.0);
    if (abs(w - h) < 0.5) {
        return vec2<f32>(base_freq, base_freq);
    }
    if (w > h) {
        return vec2<f32>(base_freq, base_freq * w / h);
    }
    return vec2<f32>(base_freq * h / w, base_freq);
}

fn hash_uint(x_in: u32) -> u32 {
    var x: u32 = x_in;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

fn fast_hash(p: vec3<i32>, salt: u32) -> f32 {
    var h: u32 = salt ^ 0x9e3779b9u;
    h ^= bitcast<u32>(p.x) * 0x27d4eb2du;
    h = hash_uint(h);
    h ^= bitcast<u32>(p.y) * 0xc2b2ae35u;
    h = hash_uint(h);
    h ^= bitcast<u32>(p.z) * 0x165667b1u;
    h = hash_uint(h);
    return f32(h) * INV_UINT32_MAX;
}

fn value_noise(uv: vec2<f32>, freq: vec2<f32>, motion: f32, salt: u32) -> f32 {
    let scaled_uv: vec2<f32> = uv * max(freq, vec2<f32>(1.0, 1.0));
    let cell_floor: vec2<f32> = floor(scaled_uv);
    let frac_part: vec2<f32> = fract(scaled_uv);
    let base_cell: vec2<i32> = vec2<i32>(i32(cell_floor.x), i32(cell_floor.y));

    let z_floor: f32 = floor(motion);
    let z_frac: f32 = fract(motion);
    let z0: i32 = i32(z_floor) % Z_LOOP;
    let z1: i32 = (z0 + 1) % Z_LOOP;

    let c000: f32 = fast_hash(vec3<i32>(base_cell.x + 0, base_cell.y + 0, z0), salt);
    let c100: f32 = fast_hash(vec3<i32>(base_cell.x + 1, base_cell.y + 0, z0), salt);
    let c010: f32 = fast_hash(vec3<i32>(base_cell.x + 0, base_cell.y + 1, z0), salt);
    let c110: f32 = fast_hash(vec3<i32>(base_cell.x + 1, base_cell.y + 1, z0), salt);
    let c001: f32 = fast_hash(vec3<i32>(base_cell.x + 0, base_cell.y + 0, z1), salt);
    let c101: f32 = fast_hash(vec3<i32>(base_cell.x + 1, base_cell.y + 0, z1), salt);
    let c011: f32 = fast_hash(vec3<i32>(base_cell.x + 0, base_cell.y + 1, z1), salt);
    let c111: f32 = fast_hash(vec3<i32>(base_cell.x + 1, base_cell.y + 1, z1), salt);

    let tx: f32 = fade(frac_part.x);
    let ty: f32 = fade(frac_part.y);
    let tz: f32 = fade(z_frac);

    let x00: f32 = mix(c000, c100, tx);
    let x10: f32 = mix(c010, c110, tx);
    let x01: f32 = mix(c001, c101, tx);
    let x11: f32 = mix(c011, c111, tx);

    let y0: f32 = mix(x00, x10, ty);
    let y1: f32 = mix(x01, x11, ty);

    return mix(y0, y1, tz);
}

// Paper: 3-octave ridged noise (original texture)
fn height_paper(uv: vec2<f32>, base_freq: vec2<f32>, motion: f32) -> f32 {
    var freq: vec2<f32> = max(base_freq, vec2<f32>(1.0, 1.0));
    var amplitude: f32 = 0.5;
    var accum: f32 = 0.0;
    var total: f32 = 0.0;

    for (var octave: u32 = 0u; octave < 3u; octave = octave + 1u) {
        let salt: u32 = 0x9e3779b9u * (octave + 1u);
        let sample_val: f32 = value_noise(uv, freq, motion + f32(octave) * 0.37, salt);
        let ridged: f32 = 1.0 - abs(sample_val * 2.0 - 1.0);
        accum = accum + ridged * amplitude;
        total = total + amplitude;
        freq = freq * 2.0;
        amplitude = amplitude * 0.55;
    }

    if (total <= 0.0) { return clamp01(accum); }
    return clamp01(accum / total);
}

// Stucco: 2-octave smooth noise, lower frequency, rounder bumps
fn height_stucco(uv: vec2<f32>, base_freq: vec2<f32>, motion: f32) -> f32 {
    var freq: vec2<f32> = max(base_freq, vec2<f32>(1.0, 1.0));
    var amplitude: f32 = 0.5;
    var accum: f32 = 0.0;
    var total: f32 = 0.0;

    for (var octave: u32 = 0u; octave < 2u; octave = octave + 1u) {
        let salt: u32 = 0x9e3779b9u * (octave + 1u);
        let sample_val: f32 = value_noise(uv, freq, motion + f32(octave) * 0.37, salt);
        accum = accum + sample_val * amplitude;
        total = total + amplitude;
        freq = freq * 2.0;
        amplitude = amplitude * 0.5;
    }

    if (total <= 0.0) { return clamp01(accum); }
    return clamp01(accum / total);
}

// Canvas: woven fabric pattern with slight noise perturbation
fn height_canvas(uv: vec2<f32>, base_freq: vec2<f32>, motion: f32) -> f32 {
    let st: vec2<f32> = uv * base_freq;
    let warpX: f32 = abs(sin(st.x * PI));
    let weftY: f32 = abs(sin(st.y * PI));
    let weave: f32 = warpX * weftY;

    let noise: f32 = value_noise(uv, base_freq * 0.5, motion, 0x12345678u);
    return clamp01(weave * 0.85 + noise * 0.15);
}

// Halftone: regular circular dot grid
fn height_halftone(uv: vec2<f32>, base_freq: vec2<f32>) -> f32 {
    let st: vec2<f32> = uv * base_freq;
    let cell: vec2<f32> = fract(st) - 0.5;
    let dot: f32 = 1.0 - clamp01(length(cell) * 3.0);
    return dot * dot;
}

// Crosshatch: two overlapping diagonal sine ridges
fn height_crosshatch(uv: vec2<f32>, base_freq: vec2<f32>) -> f32 {
    let st: vec2<f32> = uv * base_freq;
    let d1: f32 = abs(sin((st.x + st.y) * PI));
    let d2: f32 = abs(sin((st.x - st.y) * PI));
    return clamp01(d1 * d2);
}

// Dispatch to the active mode's height function — single variant selected
// at compile time by the MODE const (Dawn constant-folds).
fn height_field(uv: vec2<f32>, base_freq: vec2<f32>, motion: f32) -> f32 {
    if (MODE == 0) { return height_canvas(uv, base_freq, motion); }
    if (MODE == 1) { return height_crosshatch(uv, base_freq); }
    if (MODE == 2) { return height_halftone(uv, base_freq); }
    if (MODE == 4) { return height_stucco(uv, base_freq, motion); }
    return height_paper(uv, base_freq, motion);  // 3 = paper (default)
}

fn material_hash(p: vec2<i32>, salt: u32, layer: u32) -> u32 {
    var h: u32 = salt ^ (layer * 0x9e3779b9u);
    h ^= bitcast<u32>(p.x) * 0x27d4eb2du;
    h = hash_uint(h);
    h ^= bitcast<u32>(p.y) * 0xc2b2ae35u;
    return hash_uint(h);
}

fn material_gradient(p: vec2<i32>, salt: u32, layer: u32) -> vec2<f32> {
    let h: u32 = material_hash(p, salt, layer);
    var gradient = vec2<f32>(f32(h & 0xffffu), f32(h >> 16u)) * (2.0 / 65535.0) - 1.0;
    gradient *= inverseSqrt(max(dot(gradient, gradient), 0.000001));
    return gradient;
}

fn material_fade(t: vec2<f32>) -> vec2<f32> {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn material_gradient_layer(p: vec2<f32>, salt: u32, layer: u32) -> f32 {
    let cellFloor = floor(p);
    let cell = vec2<i32>(i32(cellFloor.x), i32(cellFloor.y));
    let local = fract(p);
    let n00 = dot(material_gradient(cell, salt, layer), local);
    let n10 = dot(material_gradient(cell + vec2<i32>(1, 0), salt, layer), local - vec2<f32>(1.0, 0.0));
    let n01 = dot(material_gradient(cell + vec2<i32>(0, 1), salt, layer), local - vec2<f32>(0.0, 1.0));
    let n11 = dot(material_gradient(cell + vec2<i32>(1, 1), salt, layer), local - vec2<f32>(1.0, 1.0));
    let blend = material_fade(local);
    return mix(mix(n00, n10, blend.x), mix(n01, n11, blend.x), blend.y);
}

fn material_noise(globalPixel: vec2<f32>, cellSize: vec2<f32>, motion: f32, salt: u32) -> f32 {
    let p = globalPixel / max(cellSize, vec2<f32>(0.5));
    let zFloor = floor(motion);
    let z0 = i32(zFloor) % Z_LOOP;
    let z1 = (z0 + 1) % Z_LOOP;
    let n0 = material_gradient_layer(p, salt, u32(z0));
    let n1 = material_gradient_layer(p, salt, u32(z1));
    let n = mix(n0, n1, material_fade(vec2<f32>(fract(motion))).x);
    return clamp01(0.5 + n * 0.72);
}

fn material_soft(globalPixel: vec2<f32>, motion: f32, salt: u32, size: f32) -> f32 {
    // Two incommensurate gradient fields make a smooth isotropic surface.
    // Quintic interpolation keeps enlarged cells continuous without exposing
    // the square lattice that value noise reveals at high scale.
    let primaryCell = vec2<f32>(max(size * 3.25, 1.5));
    let primary = material_noise(globalPixel, primaryCell, motion, salt);
    let secondary = material_noise(globalPixel + vec2<f32>(17.31, 29.17), primaryCell * 1.87,
        motion + 0.41, salt ^ 0x68bc21ebu);
    return primary * 0.68 + secondary * 0.32;
}

fn material_directional(globalPixel: vec2<f32>, motion: f32, salt: u32, size: f32) -> f32 {
    // Strongly anisotropic gradient fields create continuous fibers directly,
    // avoiding both a stretched square lattice and a costly multi-tap blur.
    let primaryCell = vec2<f32>(max(size * 22.0, 8.0), max(size * 2.0, 1.25));
    let secondaryCell = vec2<f32>(max(size * 37.0, 13.0), max(size * 3.7, 2.3));
    let primary = material_noise(globalPixel, primaryCell, motion, salt);
    let secondary = material_noise(globalPixel + vec2<f32>(19.37, 11.83), secondaryCell,
        motion + 0.41, salt ^ 0x68bc21ebu);
    return primary * 0.72 + secondary * 0.28;
}

fn material_sprinkles(globalPixel: vec2<f32>, motion: f32, salt: u32, size: f32) -> f32 {
    let p: vec2<f32> = globalPixel / max(4.0 * size, 1.0) + vec2<f32>(motion * 0.31, motion * 0.19);
    let cellFloor = floor(p);
    let baseCell = vec2<i32>(i32(cellFloor.x), i32(cellFloor.y));
    let local = fract(p);
    var nearest = 10.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let cell = baseCell + vec2<i32>(x, y);
            let jx = fast_hash(vec3<i32>(cell, 0), salt) - 0.5;
            let jy = fast_hash(vec3<i32>(cell, 1), salt ^ 0x68bc21ebu) - 0.5;
            let point = vec2<f32>(f32(x), f32(y)) + 0.5 + vec2<f32>(jx, jy) * 0.6;
            nearest = min(nearest, length(local - point));
        }
    }
    return mix(0.45, 1.0, 1.0 - smoothstep(0.10, 0.22, nearest));
}

fn material_edge_mask(uv: vec2<f32>, pixelStep: vec2<f32>) -> f32 {
    let weights: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);
    let l: f32 = dot(textureSample(inputTex, u_sampler, uv - vec2<f32>(pixelStep.x, 0.0)).xyz, weights);
    let r: f32 = dot(textureSample(inputTex, u_sampler, uv + vec2<f32>(pixelStep.x, 0.0)).xyz, weights);
    let d: f32 = dot(textureSample(inputTex, u_sampler, uv - vec2<f32>(0.0, pixelStep.y)).xyz, weights);
    let u: f32 = dot(textureSample(inputTex, u_sampler, uv + vec2<f32>(0.0, pixelStep.y)).xyz, weights);
    return clamp(length(vec2<f32>(r - l, u - d)) * 6.0, 0.0, 1.0);
}

fn material_value(globalPixel: vec2<f32>, dims: vec2<f32>, uv: vec2<f32>, motion: f32, salt: u32) -> f32 {
    let size: f32 = max(scale, 0.1);
    if (MODE == 6) {
        return material_soft(globalPixel, motion, salt, size);
    }
    if (MODE == 7) {
        return material_sprinkles(globalPixel, motion, salt, size);
    }
    if (MODE == 8) {
        let a: f32 = material_noise(globalPixel, vec2<f32>(13.0 * size), motion, salt);
        let b: f32 = material_noise(globalPixel, vec2<f32>(6.0 * size), motion + 0.31, salt ^ 0x9e3779b9u);
        let c: f32 = material_noise(globalPixel, vec2<f32>(2.5 * size), motion + 0.67, salt ^ 0x85ebca6bu);
        return a * 0.58 + b * 0.28 + c * 0.14;
    }
    if (MODE == 9) {
        let n: f32 = material_noise(globalPixel, vec2<f32>(max(size * 1.5, 0.8)), motion, salt);
        return s_curve01(s_curve01(n));
    }
    if (MODE == 10) {
        return material_noise(globalPixel, vec2<f32>(4.5 * size), motion, salt);
    }
    if (MODE == 11) {
        return step(0.5, material_noise(globalPixel, vec2<f32>(max(size * 1.5, 0.8)), motion, salt));
    }
    if (MODE == 12) {
        return material_directional(globalPixel, motion, salt, size);
    }
    if (MODE == 13) {
        return material_directional(globalPixel.yx, motion, salt, size);
    }
    if (MODE == 14) {
        let n: f32 = material_noise(globalPixel, vec2<f32>(max(size * 1.5, 0.8)), motion, salt);
        return mix(0.5, n, material_edge_mask(uv, 1.0 / dims));
    }
    return material_noise(globalPixel, vec2<f32>(max(size * 1.5, 0.8)), motion, salt);
}

fn shape_material(raw: f32) -> f32 {
    let amount: f32 = intensity / 40.0;
    let shaped: f32 = raw * amount + 0.5 * (1.0 - amount);
    let c: f32 = clamp(contrast / 100.0, 0.0, 1.0);
    if (c < 0.5) { return mix(0.5, shaped, c * 2.0); }
    return mix(shaped, s_curve01(shaped), (c - 0.5) * 2.0);
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Modes 0..4 retain their established sampling contract. The material
    // modes were added later and normalize the source UV so their presented
    // image matches the GLSL backend instead of inheriting that old flip.
    var sourceUV = in.uv;
    if (MODE >= 5) { sourceUV.y = 1.0 - sourceUV.y; }
    let base_color: vec4<f32> = textureSample(inputTex, u_sampler, sourceUV);
    let dims: vec2<f32> = vec2<f32>(textureDimensions(inputTex, 0));
    let pixel_step: vec2<f32> = 1.0 / dims;

    let a: f32 = clamp(alpha, 0.0, 1.0);
    if (a <= 0.0) {
        return base_color;
    }

    if (MODE >= 5) {
        var globalDims: vec2<f32> = dims;
        if (fullResolution.x > 0.0) { globalDims = fullResolution; }
        let globalPixel: vec2<f32> = in.position.xy + tileOffset;
        let materialMotion: f32 = time * f32(Z_LOOP);
        let r: f32 = shape_material(material_value(globalPixel, globalDims, sourceUV, materialMotion, 0x1234abcdu));
        var material: vec3<f32> = vec3<f32>(r);
        if (mono == 0) {
            material.g = shape_material(material_value(globalPixel, globalDims, sourceUV, materialMotion, 0x68bc21ebu));
            material.b = shape_material(material_value(globalPixel, globalDims, sourceUV, materialMotion, 0x02e5be93u));
        }
        return vec4<f32>(clamp(mix(base_color.xyz, material, a), vec3<f32>(0.0), vec3<f32>(1.0)), base_color.w);
    }

    // Paper and stucco use different base frequencies
    var freq_scale: f32 = 24.0;
    if (MODE == 4) { freq_scale = 48.0; }
    let base_freq: vec2<f32> = freq_for_shape(freq_scale * (10.01 - scale), dims);
    let motion: f32 = time * f32(Z_LOOP);

    // Sample height field at center and 4 neighbors for gradient
    let h_center: f32 = height_field(in.uv, base_freq, motion);
    let h_right: f32 = height_field(in.uv + vec2<f32>(pixel_step.x, 0.0), base_freq, motion);
    let h_left: f32 = height_field(in.uv - vec2<f32>(pixel_step.x, 0.0), base_freq, motion);
    let h_up: f32 = height_field(in.uv + vec2<f32>(0.0, pixel_step.y), base_freq, motion);
    let h_down: f32 = height_field(in.uv - vec2<f32>(0.0, pixel_step.y), base_freq, motion);

    let gx: f32 = h_right - h_left;
    let gy: f32 = h_down - h_up;
    let gradient: f32 = sqrt(gx * gx + gy * gy);

    // Stucco uses stronger shading for more pronounced bumps
    var gain: f32 = SHADE_GAIN * 0.25;
    if (MODE == 4) { gain = SHADE_GAIN * 0.5; }
    let shade_base: f32 = clamp01(gradient * gain);

    let highlight_mix: f32 = clamp01((shade_base * shade_base) * 1.25);
    let base_factor: f32 = 0.9 + h_center * 0.35;
    let factor: f32 = clamp(base_factor + highlight_mix * 0.35, 0.85, 1.6);

    let scaled_rgb: vec3<f32> = clamp(base_color.xyz * factor, vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(mix(base_color.xyz, scaled_rgb, a), base_color.w);
}
