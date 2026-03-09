/*
 * Grime - dusty speckles and grime overlay
 *
 * Multi-octave noise with self-refraction, Chebyshev derivative,
 * dropout specks, and sparse noise blended to dirty the input.
 */

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> strength: f32;
@group(0) @binding(3) var<uniform> speed: f32;
@group(0) @binding(4) var<uniform> seed: f32;
@group(0) @binding(5) var<uniform> time: f32;
@group(0) @binding(6) var<uniform> resolution: vec2<f32>;

fn clamp01(v: f32) -> f32 {
    return clamp(v, 0.0, 1.0);
}

fn freq_for_shape(freq: f32, w: f32, h: f32) -> vec2<f32> {
    if (w <= 0.0 || h <= 0.0) { return vec2<f32>(freq, freq); }
    if (abs(w - h) < 0.5) { return vec2<f32>(freq, freq); }
    if (h < w) { return vec2<f32>(freq, freq * w / h); }
    return vec2<f32>(freq * h / w, freq);
}

fn hash21(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn hash31(p: vec3<f32>) -> f32 {
    return fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123);
}

fn fade(t: f32) -> f32 {
    return t * t * (3.0 - 2.0 * t);
}

fn value_noise(coord: vec2<f32>, s: f32) -> f32 {
    let cell = floor(coord);
    let f = fract(coord);
    let tl = hash31(vec3<f32>(cell, s));
    let tr = hash31(vec3<f32>(cell + vec2<f32>(1.0, 0.0), s));
    let bl = hash31(vec3<f32>(cell + vec2<f32>(0.0, 1.0), s));
    let br = hash31(vec3<f32>(cell + vec2<f32>(1.0, 1.0), s));
    let st = vec2<f32>(fade(f.x), fade(f.y));
    return mix(mix(tl, tr, st.x), mix(bl, br, st.x), st.y);
}

fn periodic_offset(t: f32, spd: f32, s: f32) -> vec2<f32> {
    let angle = t * 0.5 + s * 0.1375;
    let radius = (0.35 + spd * 0.15) * (0.25 + 0.75 * sin(s * 1.37));
    return vec2<f32>(cos(angle), sin(angle)) * radius;
}

fn simple_multires(uv: vec2<f32>, base_freq: vec2<f32>, t: f32, spd: f32, s: f32) -> f32 {
    var freq = base_freq;
    var amp: f32 = 0.5;
    var total: f32 = 0.0;
    var accum: f32 = 0.0;

    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let os = s + f32(i) * 37.11;
        let off = periodic_offset(t + f32(i) * 0.17, spd, os);
        accum = accum + value_noise(uv * freq + off, os) * amp;
        total = total + amp;
        freq = freq * 2.0;
        amp = amp * 0.5;
    }

    return clamp01(accum / max(total, 0.001));
}

fn refracted_field(uv: vec2<f32>, base_freq: vec2<f32>, t: f32, spd: f32, px: vec2<f32>, disp: f32, s: f32) -> f32 {
    let base_mask = simple_multires(uv, base_freq, t, spd, s);
    let off_mask = simple_multires(fract(uv + vec2<f32>(0.5, 0.5)), base_freq, t, spd, s + 19.0);

    let off_vec = vec2<f32>(
        (base_mask * 2.0 - 1.0) * disp * px.x,
        (off_mask * 2.0 - 1.0) * disp * px.y,
    );
    return simple_multires(fract(uv + off_vec), base_freq, t, spd, s + 41.0);
}

fn chebyshev_gradient(uv: vec2<f32>, base_freq: vec2<f32>, t: f32, spd: f32, px: vec2<f32>, disp: f32, s: f32) -> f32 {
    let ox = vec2<f32>(px.x, 0.0);
    let oy = vec2<f32>(0.0, px.y);

    let r = refracted_field(fract(uv + ox), base_freq, t, spd, px, disp, s);
    let l = refracted_field(fract(uv - ox), base_freq, t, spd, px, disp, s);
    let u = refracted_field(fract(uv + oy), base_freq, t, spd, px, disp, s);
    let d = refracted_field(fract(uv - oy), base_freq, t, spd, px, disp, s);

    let dx = (r - l) * 0.5;
    let dy = (u - d) * 0.5;
    return clamp01(max(abs(dx), abs(dy)) * 4.0);
}

fn exponential_noise(uv: vec2<f32>, freq: vec2<f32>, t: f32, spd: f32, s: f32) -> f32 {
    let off = periodic_offset(t + s * 0.07, spd, s + 7.0);
    return pow(clamp01(value_noise(uv * freq + off, s + 13.0)), 4.0);
}

fn refracted_exponential(uv: vec2<f32>, freq: vec2<f32>, t: f32, spd: f32, px: vec2<f32>, disp: f32, s: f32) -> f32 {
    let base = exponential_noise(uv, freq, t, spd, s);
    let ox = exponential_noise(uv, freq, t + 0.77, spd, s + 23.0);
    let oy = exponential_noise(fract(uv + vec2<f32>(0.5, 0.5)), freq, t + 1.23, spd, s + 47.0);

    let off_vec = vec2<f32>(
        (ox * 2.0 - 1.0) * disp * px.x,
        (oy * 2.0 - 1.0) * disp * px.y,
    );
    let warped = exponential_noise(fract(uv + off_vec), freq, t, spd, s + 59.0);
    return clamp01((base + warped) * 0.5);
}

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    let dims = max(resolution, vec2<f32>(1.0, 1.0));
    let px = vec2<f32>(1.0 / dims.x, 1.0 / dims.y);
    let uv = input.uv;
    let base_color = textureSample(inputTex, u_sampler, uv);

    let t = time;
    let spd = speed;
    let str = max(strength, 0.0);
    let s = seed;

    // Multi-octave noise mask, self-refracted
    let freq_mask = freq_for_shape(5.0, dims.x, dims.y);
    let mask_refracted = refracted_field(uv, freq_mask, t, spd, px, 1.0, s + 11.0);
    let mask_gradient = chebyshev_gradient(uv, freq_mask, t, spd, px, 1.0, s + 11.0);
    let mask_value = clamp01(mix(mask_refracted, mask_gradient, 0.125));

    // Blend input with dark dust using squared mask
    let mask_power = clamp01(mask_value * mask_value * 0.075);
    var dusty = mix(base_color.rgb, vec3<f32>(0.25), mask_power);

    // Speck overlay: dropout + exponential noise, refracted
    let freq_specks = dims * 0.25;
    let dropout = select(0.0, 1.0, hash21(uv * dims + vec2<f32>(s + 37.0, s * 1.37)) < 0.25);
    let specks_field = refracted_exponential(uv, freq_specks, t, spd, px, 0.25, s + 71.0) * dropout;
    let trimmed = clamp01((specks_field - 0.625) / 0.375);
    let specks = 1.0 - sqrt(trimmed);

    // Sparse noise
    let sparse_mask = select(0.0, 1.0, hash21(uv * dims + vec2<f32>(s + 113.0, s + 171.0)) < 0.15);
    let sparse_noise = exponential_noise(uv, dims, t, spd, s + 131.0) * sparse_mask;

    // Combine
    dusty = mix(dusty, vec3<f32>(sparse_noise), 0.075);
    dusty = dusty * specks;

    // Final blend: mix input toward dusty layer using mask * strength
    let blend_mask = clamp01(mask_value * 0.75 * str);
    let final_rgb = mix(base_color.rgb, dusty, blend_mask);

    return vec4<f32>(clamp(final_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), base_color.a);
}
