// Clouds effect pass 1: Generate ridged multires noise control at 25% resolution with warp
// Outputs: R=combined mask, G=control raw value for shading pass, B=0, A=1

@group(0) @binding(0) var<uniform> speed: f32;
@group(0) @binding(1) var<uniform> time: f32;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;

const CONTROL_OCTAVES: u32 = 8u;
const WARP_OCTAVES: u32 = 2u;
const WARP_SUB_OCTAVES: u32 = 3u;
const WARP_DISPLACEMENT: f32 = 0.0;  // Disabled - clean cloud shapes
const PI: f32 = 3.14159265358979323846;
const TAU: f32 = 6.28318530717958647692;

const CONTROL_BASE_SEED: vec3<f32> = vec3<f32>(17.0, 29.0, 47.0);
const CONTROL_TIME_SEED: vec3<f32> = vec3<f32>(71.0, 113.0, 191.0);
const WARP_BASE_SEED: vec3<f32> = vec3<f32>(23.0, 37.0, 59.0);
const WARP_TIME_SEED: vec3<f32> = vec3<f32>(83.0, 127.0, 211.0);

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn wrap_component(value: f32, size: f32) -> f32 {
    if (size <= 0.0) {
        return 0.0;
    }
    var wrapped: f32 = value - floor(value / size) * size;
    if (wrapped < 0.0) {
        wrapped = wrapped + size;
    }
    return wrapped;
}

fn wrap_coord(coord: vec2<f32>, dims: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(wrap_component(coord.x, dims.x), wrap_component(coord.y, dims.y));
}

fn freq_for_shape(base_freq: f32, dims: vec2<f32>) -> vec2<f32> {
    let width: f32 = max(dims.x, 1.0);
    let height: f32 = max(dims.y, 1.0);
    if (abs(width - height) < 0.5) {
        return vec2<f32>(base_freq, base_freq);
    }
    if (height < width) {
        return vec2<f32>(base_freq, base_freq * width / height);
    }
    return vec2<f32>(base_freq * height / width, base_freq);
}

fn ridge_transform(value: f32) -> f32 {
    return 1.0 - abs(value * 2.0 - 1.0);
}

fn normalized_sine(value: f32) -> f32 {
    return sin(value) * 0.5 + 0.5;
}

fn periodic_value(value: f32, phase: f32) -> f32 {
    return normalized_sine((value - phase) * TAU);
}

fn mod_289_vec3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod_289_vec4(x: vec4<f32>) -> vec4<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec4<f32>) -> vec4<f32> {
    return mod_289_vec4(((x * 34.0) + 1.0) * x);
}

fn taylor_inv_sqrt(r: vec4<f32>) -> vec4<f32> {
    return 1.79284291400159 - 0.85373472095314 * r;
}

fn simplex_noise(v: vec3<f32>) -> f32 {
    let c: vec2<f32> = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
    let d: vec4<f32> = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    let i0: vec3<f32> = floor(v + dot(v, vec3<f32>(c.y)));
    let x0: vec3<f32> = v - i0 + dot(i0, vec3<f32>(c.x));

    let step1: vec3<f32> = step(vec3<f32>(x0.y, x0.z, x0.x), x0);
    let l: vec3<f32> = vec3<f32>(1.0) - step1;
    let i1: vec3<f32> = min(step1, vec3<f32>(l.z, l.x, l.y));
    let i2: vec3<f32> = max(step1, vec3<f32>(l.z, l.x, l.y));

    let x1: vec3<f32> = x0 - i1 + vec3<f32>(c.x);
    let x2: vec3<f32> = x0 - i2 + vec3<f32>(c.y);
    let x3: vec3<f32> = x0 - vec3<f32>(d.y);

    let i: vec3<f32> = mod_289_vec3(i0);
    let p: vec4<f32> = permute(permute(permute(
        i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));

    let n_: f32 = 0.14285714285714285;
    let ns: vec3<f32> = n_ * vec3<f32>(d.w, d.y, d.z) - vec3<f32>(d.x, d.z, d.x);

    let j: vec4<f32> = p - 49.0 * floor(p * ns.z * ns.z);
    let x_: vec4<f32> = floor(j * ns.z);
    let y_: vec4<f32> = floor(j - 7.0 * x_);

    let x: vec4<f32> = x_ * ns.x + ns.y;
    let y: vec4<f32> = y_ * ns.x + ns.y;
    let h: vec4<f32> = 1.0 - abs(x) - abs(y);

    let b0: vec4<f32> = vec4<f32>(x.x, x.y, y.x, y.y);
    let b1: vec4<f32> = vec4<f32>(x.z, x.w, y.z, y.w);

    let s0: vec4<f32> = floor(b0) * 2.0 + 1.0;
    let s1: vec4<f32> = floor(b1) * 2.0 + 1.0;
    let sh: vec4<f32> = -step(h, vec4<f32>(0.0));

    let a0: vec4<f32> = vec4<f32>(b0.x, b0.z, b0.y, b0.w)
        + vec4<f32>(s0.x, s0.z, s0.y, s0.w) * vec4<f32>(sh.x, sh.x, sh.y, sh.y);
    let a1: vec4<f32> = vec4<f32>(b1.x, b1.z, b1.y, b1.w)
        + vec4<f32>(s1.x, s1.z, s1.y, s1.w) * vec4<f32>(sh.z, sh.z, sh.w, sh.w);

    let g0: vec3<f32> = vec3<f32>(a0.x, a0.y, h.x);
    let g1: vec3<f32> = vec3<f32>(a0.z, a0.w, h.y);
    let g2: vec3<f32> = vec3<f32>(a1.x, a1.y, h.z);
    let g3: vec3<f32> = vec3<f32>(a1.z, a1.w, h.w);

    let norm: vec4<f32> = taylor_inv_sqrt(vec4<f32>(
        dot(g0, g0),
        dot(g1, g1),
        dot(g2, g2),
        dot(g3, g3)
    ));

    let g0n: vec3<f32> = g0 * norm.x;
    let g1n: vec3<f32> = g1 * norm.y;
    let g2n: vec3<f32> = g2 * norm.z;
    let g3n: vec3<f32> = g3 * norm.w;

    let m0: f32 = max(0.6 - dot(x0, x0), 0.0);
    let m1: f32 = max(0.6 - dot(x1, x1), 0.0);
    let m2: f32 = max(0.6 - dot(x2, x2), 0.0);
    let m3: f32 = max(0.6 - dot(x3, x3), 0.0);

    let m0sq: f32 = m0 * m0;
    let m1sq: f32 = m1 * m1;
    let m2sq: f32 = m2 * m2;
    let m3sq: f32 = m3 * m3;

    return 42.0 * (
        m0sq * m0sq * dot(g0n, x0) +
        m1sq * m1sq * dot(g1n, x1) +
        m2sq * m2sq * dot(g2n, x2) +
        m3sq * m3sq * dot(g3n, x3)
    );
}

fn animated_simplex_value(
    coord: vec2<f32>,
    dims: vec2<f32>,
    freq: vec2<f32>,
    timeValue: f32,
    speedValue: f32,
    baseSeed: vec3<f32>,
    timeSeed: vec3<f32>
) -> f32 {
    // Slow down animation - time in shaders increments much faster than Python
    let slowTime: f32 = timeValue * 0.002;  // ~500x slower for gentle cloud drift
    let angle: f32 = TAU * slowTime;
    let zCoord: f32 = cos(angle) * speedValue;

    let scaleFactor: vec2<f32> = freq / dims;
    let scaledCoord: vec2<f32> = coord * scaleFactor;

    // Simplex returns ~[-1, 1], normalize to [0, 1] to match Python
    var baseNoise: f32 = simplex_noise(vec3<f32>(
        scaledCoord.x + baseSeed.x,
        scaledCoord.y + baseSeed.y,
        zCoord
    ));
    baseNoise = baseNoise * 0.5 + 0.5;  // [-1,1] -> [0,1]

    if (speedValue == 0.0 || timeValue == 0.0) {
        return baseNoise;
    }

    var timeNoise: f32 = simplex_noise(vec3<f32>(
        scaledCoord.x + timeSeed.x,
        scaledCoord.y + timeSeed.y,
        1.0
    ));
    timeNoise = timeNoise * 0.5 + 0.5;  // [-1,1] -> [0,1]

    let scaledTime: f32 = periodic_value(timeValue, timeNoise) * speedValue;
    return periodic_value(scaledTime, baseNoise);
}

fn seeded_base_frequency(dims: vec2<f32>) -> f32 {
    let hashVal: f32 = fract(sin(dot(dims, vec2<f32>(12.9898, 78.233))) * 43758.5453123);
    return floor(hashVal * 3.0) + 2.0;
}

fn simplex_multires_value(
    coord: vec2<f32>,
    dims: vec2<f32>,
    baseFreq: vec2<f32>,
    timeValue: f32,
    speedValue: f32,
    octaves: u32,
    ridged: bool,
    baseSeed: vec3<f32>,
    timeSeed: vec3<f32>
) -> f32 {
    let safeDims: vec2<f32> = vec2<f32>(max(dims.x, 1.0), max(dims.y, 1.0));

    var accum: f32 = 0.0;

    for (var octave: u32 = 1u; octave <= octaves; octave = octave + 1u) {
        let multiplier: f32 = pow(2.0, f32(octave));
        let octaveFreq: vec2<f32> = vec2<f32>(
            baseFreq.x * 0.5 * multiplier,
            baseFreq.y * 0.5 * multiplier
        );

        if (octaveFreq.x > safeDims.x && octaveFreq.y > safeDims.y) {
            break;
        }

        let seedOffset: vec3<f32> = vec3<f32>(
            f32(octave) * 37.0,
            f32(octave) * 53.0,
            f32(octave) * 19.0
        );
        let timeOffset: vec3<f32> = vec3<f32>(
            f32(octave) * 41.0,
            f32(octave) * 23.0,
            f32(octave) * 61.0
        );

        let sampleValue: f32 = animated_simplex_value(
            coord,
            safeDims,
            octaveFreq,
            timeValue + f32(octave) * 0.07,
            speedValue,
            baseSeed + seedOffset,
            timeSeed + timeOffset
        );

        var layer: f32 = sampleValue;
        if (ridged) {
            layer = ridge_transform(layer);
        }

        let amplitude: f32 = 1.0 / multiplier;
        accum = accum + layer * amplitude;
    }

    return accum;
}

fn warp_coordinate(
    coord: vec2<f32>,
    dims: vec2<f32>,
    timeValue: f32,
    speedValue: f32
) -> vec2<f32> {
    var warped: vec2<f32> = coord;
    let baseFreq: vec2<f32> = freq_for_shape(3.0, dims);

    for (var octave: u32 = 0u; octave < WARP_OCTAVES; octave = octave + 1u) {
        let freqScale: vec2<f32> = baseFreq * pow(2.0, f32(octave));
        let flowX: f32 = simplex_multires_value(
            warped,
            dims,
            freqScale,
            timeValue + f32(octave) * 0.21,
            speedValue,
            WARP_SUB_OCTAVES,
            false,
            WARP_BASE_SEED + vec3<f32>(f32(octave) * 13.0, f32(octave) * 17.0, f32(octave) * 19.0),
            WARP_TIME_SEED + vec3<f32>(f32(octave) * 23.0, f32(octave) * 29.0, f32(octave) * 31.0)
        );

        let flowY: f32 = simplex_multires_value(
            wrap_coord(warped + vec2<f32>(0.5, 0.5), dims),
            dims,
            freqScale,
            timeValue + f32(octave) * 0.37,
            speedValue,
            WARP_SUB_OCTAVES,
            false,
            WARP_BASE_SEED + vec3<f32>(f32(octave) * 19.0, f32(octave) * 23.0, f32(octave) * 29.0) + vec3<f32>(11.0, 7.0, 5.0),
            WARP_TIME_SEED + vec3<f32>(f32(octave) * 31.0, f32(octave) * 37.0, f32(octave) * 41.0) + vec3<f32>(13.0, 19.0, 17.0)
        );

        let offsetVec: vec2<f32> = vec2<f32>(flowX * 2.0 - 1.0, flowY * 2.0 - 1.0);
        let displacement: f32 = WARP_DISPLACEMENT / pow(2.0, f32(octave));
        // Python warp uses displacement as fraction of image, not multiplied by dims
        warped = wrap_coord(warped + offsetVec * displacement * min(dims.x, dims.y), dims);
    }

    return warped;
}

fn control_value_at(
    coord: vec2<f32>,
    dims: vec2<f32>,
    timeValue: f32,
    speedValue: f32
) -> f32 {
    let baseFreqValue: f32 = seeded_base_frequency(dims);
    let freqVec: vec2<f32> = freq_for_shape(baseFreqValue, dims);
    let warpedCoord: vec2<f32> = warp_coordinate(coord, dims, 0.0, 1.0);
    return simplex_multires_value(
        warpedCoord,
        dims,
        freqVec,
        timeValue,
        speedValue,
        CONTROL_OCTAVES,
        true,
        CONTROL_BASE_SEED,
        CONTROL_TIME_SEED
    );
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let downDims: vec2<f32> = resolution;
    
    if (pos.x >= downDims.x || pos.y >= downDims.y) {
        return vec4<f32>(0.0);
    }
    
    let coord: vec2<f32> = floor(pos.xy);
    let timeValue: f32 = time;
    let speedValue: f32 = speed;

    // Generate control value (ridged multires noise with warp)
    let controlRaw: f32 = control_value_at(coord, downDims, timeValue, speedValue);
    
    // Output: R=0, G=0, B=control_raw (matching GLSL format for shade pass)
    return vec4<f32>(0.0, 0.0, controlRaw, 1.0);
}
