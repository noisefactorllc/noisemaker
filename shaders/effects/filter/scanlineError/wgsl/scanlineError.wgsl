// Scanline error glitch effect.
// Animated exponential noise bands modulate both a horizontal displacement
// field and an additive white-noise overlay.

const TAU: f32 = 6.283185307179586;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> speed: f32;
@group(0) @binding(2) var<uniform> timeOffset: f32;
@group(0) @binding(3) var<uniform> enabled: i32;
@group(0) @binding(4) var<uniform> time: f32;

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn mod289_vec3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_vec4(x: vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec4<f32>) -> vec4<f32> {
    return mod289_vec4(((x * 34.0) + 1.0) * x);
}

fn taylor_inv_sqrt(r: vec4<f32>) -> vec4<f32> {
    return 1.79284291400159 - 0.85373472095314 * r;
}

fn simplex_noise(v: vec3<f32>) -> f32 {
    let c = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
    let d = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    let i0 = floor(v + dot(v, vec3<f32>(c.y)));
    let x0 = v - i0 + dot(i0, vec3<f32>(c.x));

    let step1 = step(vec3<f32>(x0.y, x0.z, x0.x), x0);
    let l = vec3<f32>(1.0) - step1;
    let i1 = min(step1, vec3<f32>(l.z, l.x, l.y));
    let i2 = max(step1, vec3<f32>(l.z, l.x, l.y));

    let x1 = x0 - i1 + vec3<f32>(c.x);
    let x2 = x0 - i2 + vec3<f32>(c.y);
    let x3 = x0 - vec3<f32>(d.y);

    let i = mod289_vec3(i0);
    let p = permute(permute(permute(
        i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));

    let n_ = 0.14285714285714285;
    let ns = n_ * vec3<f32>(d.w, d.y, d.z) - vec3<f32>(d.x, d.z, d.x);

    let j = p - 49.0 * floor(p * ns.z * ns.z);
    let x_ = floor(j * ns.z);
    let y_ = floor(j - 7.0 * x_);

    let x = x_ * ns.x + ns.y;
    let y = y_ * ns.x + ns.y;
    let h = 1.0 - abs(x) - abs(y);

    let b0 = vec4<f32>(x.x, x.y, y.x, y.y);
    let b1 = vec4<f32>(x.z, x.w, y.z, y.w);

    let s0 = floor(b0) * 2.0 + 1.0;
    let s1 = floor(b1) * 2.0 + 1.0;
    let sh = -step(h, vec4<f32>(0.0));

    let a0 = vec4<f32>(b0.x, b0.z, b0.y, b0.w) + vec4<f32>(s0.x, s0.z, s0.y, s0.w) * vec4<f32>(sh.x, sh.x, sh.y, sh.y);
    let a1 = vec4<f32>(b1.x, b1.z, b1.y, b1.w) + vec4<f32>(s1.x, s1.z, s1.y, s1.w) * vec4<f32>(sh.z, sh.z, sh.w, sh.w);

    let g0 = vec3<f32>(a0.x, a0.y, h.x);
    let g1 = vec3<f32>(a0.z, a0.w, h.y);
    let g2 = vec3<f32>(a1.x, a1.y, h.z);
    let g3 = vec3<f32>(a1.z, a1.w, h.w);

    let norm = taylor_inv_sqrt(vec4<f32>(dot(g0, g0), dot(g1, g1), dot(g2, g2), dot(g3, g3)));

    let g0n = g0 * norm.x;
    let g1n = g1 * norm.y;
    let g2n = g2 * norm.z;
    let g3n = g3 * norm.w;

    let m0 = max(0.6 - dot(x0, x0), 0.0);
    let m1 = max(0.6 - dot(x1, x1), 0.0);
    let m2 = max(0.6 - dot(x2, x2), 0.0);
    let m3 = max(0.6 - dot(x3, x3), 0.0);

    let m0sq = m0 * m0;
    let m1sq = m1 * m1;
    let m2sq = m2 * m2;
    let m3sq = m3 * m3;

    return 42.0 * (
        m0sq * m0sq * dot(g0n, x0) +
        m1sq * m1sq * dot(g1n, x1) +
        m2sq * m2sq * dot(g2n, x2) +
        m3sq * m3sq * dot(g3n, x3)
    );
}

fn periodic_value(t: f32, value: f32) -> f32 {
    return sin((t - value) * TAU) * 0.5 + 0.5;
}

fn compute_simplex_value(coord: vec2<f32>, freq: vec2<f32>, t: f32, speed_value: f32, offset: vec3<f32>) -> f32 {
    let freq_x = max(freq.x, 1.0);
    let freq_y = max(freq.y, 1.0);
    let angle = cos(t * TAU) * speed_value;
    let sampleVec = vec3<f32>(coord.x * freq_x + offset.x, coord.y * freq_y + offset.y, angle + offset.z);
    return simplex_noise(sampleVec);
}

fn compute_value_noise(coord: vec2<f32>, freq: vec2<f32>, t: f32, speed_value: f32, base_seed: vec3<f32>, time_seed: vec3<f32>) -> f32 {
    let base_noise = compute_simplex_value(coord, freq, t, speed_value, base_seed);
    var value = clamp01(base_noise * 0.5 + 0.5);

    if (speed_value != 0.0 && t != 0.0) {
        let time_noise_raw = compute_simplex_value(coord, freq, 0.0, 1.0, time_seed);
        let time_value = clamp01(time_noise_raw * 0.5 + 0.5);
        let scaled_time = periodic_value(t, time_value) * speed_value;
        value = periodic_value(scaled_time, value);
    }

    return clamp01(value);
}

fn compute_exponential_noise(coord: vec2<f32>, freq: vec2<f32>, t: f32, speed_value: f32, base_seed: vec3<f32>, time_seed: vec3<f32>) -> f32 {
    let base = compute_value_noise(coord, freq, t, speed_value, base_seed, time_seed);
    return pow(base, 4.0);
}

fn wrap_coord(coord: i32, limit: i32) -> i32 {
    if (limit <= 0) {
        return 0;
    }
    var wrapped = coord % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

const BASE_SEED_LINE: vec3<f32> = vec3<f32>(37.0, 91.0, 53.0);
const TIME_SEED_LINE: vec3<f32> = vec3<f32>(134.0, 150.0, 184.0);
const BASE_SEED_SWERVE: vec3<f32> = vec3<f32>(11.0, 73.0, 29.0);
const TIME_SEED_SWERVE: vec3<f32> = vec3<f32>(100.0, 114.0, 178.0);
const BASE_SEED_WHITE: vec3<f32> = vec3<f32>(67.0, 29.0, 149.0);
const TIME_SEED_WHITE: vec3<f32> = vec3<f32>(180.0, 82.0, 322.0);

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex));
    let coord = vec2<i32>(in.position.xy);
    
    let width = i32(dims.x);
    let height = i32(dims.y);
    
    if (width == 0 || height == 0) {
        return vec4<f32>(0.0);
    }
    
    let input_texel = textureLoad(inputTex, coord, 0);
    
    if (enabled == 0) {
        return input_texel;
    }
    
    let width_f = dims.x;
    let height_f = dims.y;
    
    let coord_norm = (vec2<f32>(coord) + 0.5) / dims;
    let freq_line = vec2<f32>(max(floor(width_f * 0.5), 1.0), max(floor(height_f * 0.5), 1.0));
    let swerve_height = max(floor(height_f * 0.01), 1.0);
    let freq_swerve = vec2<f32>(1.0, swerve_height);
    let swerve_coord = vec2<f32>(0.0, coord_norm.y);
    
    let time_value = time + timeOffset;
    let speed_value = max(speed, 0.0);
    
    var line_noise = compute_exponential_noise(coord_norm, freq_line, time_value, speed_value * 10.0, BASE_SEED_LINE, TIME_SEED_LINE);
    line_noise = max(line_noise - 0.25, 0.0) * 2.0;
    
    var swerve_noise = compute_exponential_noise(swerve_coord, freq_swerve, time_value, speed_value, BASE_SEED_SWERVE, TIME_SEED_SWERVE);
    swerve_noise = max(swerve_noise - 0.25, 0.0) * 2.0;
    
    let line_weighted = line_noise * swerve_noise;
    let swerve_weight = swerve_noise * 2.0;
    
    let white_base = compute_value_noise(coord_norm, freq_line, time_value, speed_value * 100.0, BASE_SEED_WHITE, TIME_SEED_WHITE);
    let white_weighted = white_base * swerve_weight;
    
    let combined_error = clamp01(line_weighted + white_weighted);
    let shift_amount = combined_error * width_f * 0.025;
    let shift_pixels = i32(floor(shift_amount));
    let sample_x = wrap_coord(coord.x - shift_pixels, width);
    
    let sample_coord = vec2<i32>(sample_x, coord.y);
    let texel = textureLoad(inputTex, sample_coord, 0);
    
    let additive = clamp(line_weighted * white_weighted * 4.0, 0.0, 4.0);
    let boosted = clamp(texel.rgb + vec3<f32>(additive), vec3<f32>(0.0), vec3<f32>(1.0));
    
    return vec4<f32>(boosted, texel.a);
}
