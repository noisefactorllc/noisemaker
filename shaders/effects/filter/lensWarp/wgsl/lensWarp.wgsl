const TAU : f32 = 6.28318530717958647692;

struct LensWarpParams {
    size : vec4<f32>,    // (width, height, channels, _)
    options : vec4<f32>, // (displacement, time, speed, _)
};

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_buffer : array<f32>;
@group(0) @binding(2) var<uniform> params : LensWarpParams;

fn as_u32(value : f32) -> u32 {
    return u32(max(value, 0.0));
}

fn clamp01(value : f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn wrap_coord(value : i32, limit : i32) -> i32 {
    if (limit <= 0) {
        return 0;
    }
    var wrapped : i32 = value % limit;
    if (wrapped < 0) {
        wrapped = wrapped + limit;
    }
    return wrapped;
}

fn wrap_float(value : f32, limit : f32) -> f32 {
    if (limit <= 0.0) {
        return 0.0;
    }
    var result : f32 = value - floor(value / limit) * limit;
    if (result < 0.0) {
        result = result + limit;
    }
    return result;
}

fn freq_for_shape(base_freq : f32, width : f32, height : f32) -> vec2<f32> {
    let freq : f32 = max(base_freq, 1.0);
    let width_safe : f32 = max(width, 1.0);
    let height_safe : f32 = max(height, 1.0);

    if (abs(width_safe - height_safe) < 1e-5) {
        return vec2<f32>(freq, freq);
    }

    if (height_safe < width_safe) {
        let scaled : f32 = floor(freq * width_safe / height_safe);
        return vec2<f32>(freq, max(scaled, 1.0));
    }

    let scaled : f32 = floor(freq * height_safe / width_safe);
    return vec2<f32>(max(scaled, 1.0), freq);
}

fn normalized_sine(value : f32) -> f32 {
    return sin(value) * 0.5 + 0.5;
}

fn periodic_value(time : f32, value : f32) -> f32 {
    return normalized_sine((time - value) * TAU);
}

fn mod289_vec3(x : vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_vec4(x : vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x : vec4<f32>) -> vec4<f32> {
    return mod289_vec4(((x * 34.0) + 1.0) * x);
}

fn taylor_inv_sqrt(r : vec4<f32>) -> vec4<f32> {
    return 1.79284291400159 - 0.85373472095314 * r;
}

fn simplex_noise(v : vec3<f32>) -> f32 {
    let C : vec2<f32> = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
    let D : vec4<f32> = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    let i0 : vec3<f32> = floor(v + dot(v, vec3<f32>(C.y)));
    let x0 : vec3<f32> = v - i0 + dot(i0, vec3<f32>(C.x));

    let step1 : vec3<f32> = step(vec3<f32>(x0.y, x0.z, x0.x), x0);
    let l : vec3<f32> = vec3<f32>(1.0) - step1;
    let i1 : vec3<f32> = min(step1, vec3<f32>(l.z, l.x, l.y));
    let i2 : vec3<f32> = max(step1, vec3<f32>(l.z, l.x, l.y));

    let x1 : vec3<f32> = x0 - i1 + vec3<f32>(C.x);
    let x2 : vec3<f32> = x0 - i2 + vec3<f32>(C.y);
    let x3 : vec3<f32> = x0 - vec3<f32>(D.y);

    let i = mod289_vec3(i0);
    let p = permute(
        permute(
            permute(i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0)
        )
        + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0)
    );

    let n_ : f32 = 0.14285714285714285;
    let ns : vec3<f32> = n_ * vec3<f32>(D.w, D.y, D.z) - vec3<f32>(D.x, D.z, D.x);

    let j : vec4<f32> = p - 49.0 * floor(p * ns.z * ns.z);
    let x_ : vec4<f32> = floor(j * ns.z);
    let y_ : vec4<f32> = floor(j - 7.0 * x_);

    let x = x_ * ns.x + ns.y;
    let y = y_ * ns.x + ns.y;
    let h = 1.0 - abs(x) - abs(y);

    let b0 : vec4<f32> = vec4<f32>(x.x, x.y, y.x, y.y);
    let b1 : vec4<f32> = vec4<f32>(x.z, x.w, y.z, y.w);

    let s0 : vec4<f32> = floor(b0) * 2.0 + 1.0;
    let s1 : vec4<f32> = floor(b1) * 2.0 + 1.0;
    let sh : vec4<f32> = -step(h, vec4<f32>(0.0));

    let a0 : vec4<f32> = vec4<f32>(b0.x, b0.z, b0.y, b0.w)
        + vec4<f32>(s0.x, s0.z, s0.y, s0.w) * vec4<f32>(sh.x, sh.x, sh.y, sh.y);
    let a1 : vec4<f32> = vec4<f32>(b1.x, b1.z, b1.y, b1.w)
        + vec4<f32>(s1.x, s1.z, s1.y, s1.w) * vec4<f32>(sh.z, sh.z, sh.w, sh.w);

    let g0 : vec3<f32> = vec3<f32>(a0.x, a0.y, h.x);
    let g1 : vec3<f32> = vec3<f32>(a0.z, a0.w, h.y);
    let g2 : vec3<f32> = vec3<f32>(a1.x, a1.y, h.z);
    let g3 : vec3<f32> = vec3<f32>(a1.z, a1.w, h.w);

    let norm : vec4<f32> = taylor_inv_sqrt(vec4<f32>(
        dot(g0, g0),
        dot(g1, g1),
        dot(g2, g2),
        dot(g3, g3)
    ));

    let g0n : vec3<f32> = g0 * norm.x;
    let g1n : vec3<f32> = g1 * norm.y;
    let g2n : vec3<f32> = g2 * norm.z;
    let g3n : vec3<f32> = g3 * norm.w;

    let m0 : f32 = max(0.6 - dot(x0, x0), 0.0);
    let m1 : f32 = max(0.6 - dot(x1, x1), 0.0);
    let m2 : f32 = max(0.6 - dot(x2, x2), 0.0);
    let m3 : f32 = max(0.6 - dot(x3, x3), 0.0);

    let m0sq : f32 = m0 * m0;
    let m1sq : f32 = m1 * m1;
    let m2sq : f32 = m2 * m2;
    let m3sq : f32 = m3 * m3;

    return 42.0 * (
        m0sq * m0sq * dot(g0n, x0)
        + m1sq * m1sq * dot(g1n, x1)
        + m2sq * m2sq * dot(g2n, x2)
        + m3sq * m3sq * dot(g3n, x3)
    );
}

// Cosine interpolation (matches Python blend_cosine / spline_order=2)
fn blend_cosine(a : f32, b : f32, t : f32) -> f32 {
    let t2 : f32 = (1.0 - cos(t * 3.14159265358979323846)) * 0.5;
    return a * (1.0 - t2) + b * t2;
}

// Evaluate simplex noise at an integer grid coordinate, mapped to [0,1]
fn grid_simplex(gx : f32, gy : f32, gz : f32, seed : vec3<f32>) -> f32 {
    return simplex_noise(vec3<f32>(gx + seed.x, gy + seed.y, gz + seed.z)) * 0.5 + 0.5;
}

// Generate noise matching Python values(freq, shape, spline_order=2):
// Evaluate simplex at integer grid coords, cosine-interpolate, normalize
fn compute_noise_value(
    coord : vec2<u32>,
    width : f32,
    height : f32,
    freq : vec2<f32>,
    time_val : f32,
    speed_val : f32,
) -> f32 {
    let width_safe : f32 = max(width, 1.0);
    let height_safe : f32 = max(height, 1.0);
    let freq_x : f32 = max(freq.y, 1.0);
    let freq_y : f32 = max(freq.x, 1.0);

    // Map pixel to grid position (matching Python resample mapping)
    let grid_pos : vec2<f32> = vec2<f32>(
        f32(coord.x) * freq_x / width_safe,
        f32(coord.y) * freq_y / height_safe
    );

    // Grid cell and fractional position
    let cell : vec2<f32> = floor(grid_pos);
    let fract_pos : vec2<f32> = grid_pos - cell;

    // Wrap grid coordinates (matching Python modulo wrapping)
    let cx0 : f32 = cell.x % freq_x;
    let cx1 : f32 = (cell.x + 1.0) % freq_x;
    let cy0 : f32 = cell.y % freq_y;
    let cy1 : f32 = (cell.y + 1.0) % freq_y;

    // Time component (matching Python: z = cos(time * TAU) * speed)
    let z_base : f32 = cos(time_val * TAU) * speed_val;
    let base_seed : vec3<f32> = vec3<f32>(17.0, 29.0, 47.0);

    // Evaluate simplex at 4 grid corners
    var v00 : f32 = grid_simplex(cx0, cy0, z_base, base_seed);
    var v10 : f32 = grid_simplex(cx1, cy0, z_base, base_seed);
    var v01 : f32 = grid_simplex(cx0, cy1, z_base, base_seed);
    var v11 : f32 = grid_simplex(cx1, cy1, z_base, base_seed);

    // Normalize grid values to [0,1] (matching Python normalize() after resample)
    let min_val : f32 = min(min(v00, v10), min(v01, v11));
    let max_val : f32 = max(max(v00, v10), max(v01, v11));
    let range_val : f32 = max_val - min_val;
    if (range_val > 0.001) {
        v00 = (v00 - min_val) / range_val;
        v10 = (v10 - min_val) / range_val;
        v01 = (v01 - min_val) / range_val;
        v11 = (v11 - min_val) / range_val;
    }

    // Cosine interpolation (matching Python spline_order=2 / blend_cosine)
    let y0 : f32 = blend_cosine(v00, v10, fract_pos.x);
    let y1 : f32 = blend_cosine(v01, v11, fract_pos.x);
    var value : f32 = blend_cosine(y0, y1, fract_pos.y);

    // Time animation (matching Python periodic_value logic)
    if (speed_val != 0.0 && time_val != 0.0) {
        let time_seed : vec3<f32> = vec3<f32>(
            base_seed.x + 54.0,
            base_seed.y + 82.0,
            base_seed.z + 124.0
        );
        // Time noise evaluated at time=0, speed=1 -> z = cos(0) * 1 = 1.0
        var t00 : f32 = grid_simplex(cx0, cy0, 1.0, time_seed);
        var t10 : f32 = grid_simplex(cx1, cy0, 1.0, time_seed);
        var t01 : f32 = grid_simplex(cx0, cy1, 1.0, time_seed);
        var t11 : f32 = grid_simplex(cx1, cy1, 1.0, time_seed);

        // Normalize time noise
        let tmin : f32 = min(min(t00, t10), min(t01, t11));
        let tmax : f32 = max(max(t00, t10), max(t01, t11));
        let trange : f32 = tmax - tmin;
        if (trange > 0.001) {
            t00 = (t00 - tmin) / trange;
            t10 = (t10 - tmin) / trange;
            t01 = (t01 - tmin) / trange;
            t11 = (t11 - tmin) / trange;
        }

        let time_value : f32 = blend_cosine(
            blend_cosine(t00, t10, fract_pos.x),
            blend_cosine(t01, t11, fract_pos.x),
            fract_pos.y
        );

        let scaled_time : f32 = periodic_value(time_val, time_value) * speed_val;
        value = clamp01(periodic_value(scaled_time, value));
    }

    return clamp01(value);
}

fn singularity_mask(uv : vec2<f32>, width : f32, height : f32) -> f32 {
    if (width <= 0.0 || height <= 0.0) {
        return 0.0;
    }

    let delta : vec2<f32> = abs(uv - vec2<f32>(0.5, 0.5));
    let aspect : f32 = width / height;
    let scaled : vec2<f32> = vec2<f32>(delta.x * aspect, delta.y);
    let max_radius : f32 = length(vec2<f32>(aspect * 0.5, 0.5));
    if (max_radius <= 0.0) {
        return 0.0;
    }

    let normalized : f32 = clamp(length(scaled) / max_radius, 0.0, 1.0);
    return pow(normalized, 5.0);
}

fn sample_bilinear(pos : vec2<f32>, width : f32, height : f32) -> vec4<f32> {
    let width_f : f32 = max(width, 1.0);
    let height_f : f32 = max(height, 1.0);

    let wrapped_x : f32 = wrap_float(pos.x, width_f);
    let wrapped_y : f32 = wrap_float(pos.y, height_f);

    var x0 : i32 = i32(floor(wrapped_x));
    var y0 : i32 = i32(floor(wrapped_y));

    let width_i : i32 = i32(width_f);
    let height_i : i32 = i32(height_f);

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

    let x1 : i32 = wrap_coord(x0 + 1, width_i);
    let y1 : i32 = wrap_coord(y0 + 1, height_i);

    let fx : f32 = clamp(wrapped_x - f32(x0), 0.0, 1.0);
    let fy : f32 = clamp(wrapped_y - f32(y0), 0.0, 1.0);

    let tex00 : vec4<f32> = textureLoad(inputTex, vec2<i32>(x0, y0), 0);
    let tex10 : vec4<f32> = textureLoad(inputTex, vec2<i32>(x1, y0), 0);
    let tex01 : vec4<f32> = textureLoad(inputTex, vec2<i32>(x0, y1), 0);
    let tex11 : vec4<f32> = textureLoad(inputTex, vec2<i32>(x1, y1), 0);

    let mix_x0 : vec4<f32> = mix(tex00, tex10, vec4<f32>(fx));
    let mix_x1 : vec4<f32> = mix(tex01, tex11, vec4<f32>(fx));
    return mix(mix_x0, mix_x1, vec4<f32>(fy));
}

fn store_pixel(base_index : u32, value : vec4<f32>) {
    output_buffer[base_index + 0u] = value.x;
    output_buffer[base_index + 1u] = value.y;
    output_buffer[base_index + 2u] = value.z;
    output_buffer[base_index + 3u] = value.w;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let width : u32 = as_u32(params.size.x);
    let height : u32 = as_u32(params.size.y);
    if (gid.x >= width || gid.y >= height) {
        return;
    }

    let pixel_index : u32 = gid.y * width + gid.x;
    let base_index : u32 = pixel_index * 4u;

    let coords : vec2<i32> = vec2<i32>(i32(gid.x), i32(gid.y));
    let original : vec4<f32> = textureLoad(inputTex, coords, 0);

    let displacement : f32 = params.options.x;
    if (displacement == 0.0) {
        store_pixel(base_index, original);
        return;
    }

    let width_f : f32 = params.size.x;
    let height_f : f32 = params.size.y;
    if (width_f <= 0.0 || height_f <= 0.0) {
        store_pixel(base_index, original);
        return;
    }

    let uv : vec2<f32> = (
        vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5, 0.5)
    ) / vec2<f32>(max(width_f, 1.0), max(height_f, 1.0));

    let freq : vec2<f32> = freq_for_shape(2.0, width_f, height_f);
    let coord : vec2<u32> = vec2<u32>(gid.xy);
    let noise_value : f32 = compute_noise_value(
        coord,
        width_f,
        height_f,
        freq,
        params.options.y,
        params.options.z
    );

    // Barrel distortion: pixels pushed radially outward, stronger at edges
    // Noise modulates the distortion strength for organic feel
    let delta : vec2<f32> = uv - vec2<f32>(0.5, 0.5);
    let r2 : f32 = dot(delta, delta);
    let k : f32 = displacement * (noise_value * 2.0 - 1.0);
    let distorted_uv : vec2<f32> = vec2<f32>(0.5, 0.5) + delta * (1.0 + k * r2);
    let sample_pos : vec2<f32> = distorted_uv * vec2<f32>(width_f, height_f);

    let warped : vec4<f32> = sample_bilinear(sample_pos, width_f, height_f);
    let clamped : vec4<f32> = clamp(warped, vec4<f32>(0.0), vec4<f32>(1.0));
    store_pixel(base_index, clamped);
}
