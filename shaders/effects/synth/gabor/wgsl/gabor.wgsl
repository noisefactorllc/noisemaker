/*
 * Gabor noise — sparse convolution of anisotropic Gabor kernels.
 * Each grid cell scatters random impulse points; the final value is the sum
 * of Gabor kernel contributions from the 3×3 cell neighborhood.
 */

struct Uniforms {
    data: array<vec4<f32>, 3>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// PCG PRNG - MIT License
fn pcg(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn gaborNoise(st: vec2<f32>, freq: f32, sigma: f32, baseAngle: f32, iso: f32, impulses: i32, t: f32, sd: f32) -> f32 {
    let cell = floor(st);
    let fr = fract(st);
    var sum = 0.0;

    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
            let neighbor = vec2<f32>(f32(dx), f32(dy));
            let cellId = cell + neighbor;

            for (var k: i32 = 0; k < 8; k = k + 1) {
                if (k >= impulses) { break; }

                let r1 = prng(vec3<f32>(cellId, sd + f32(k) * 7.0));
                let r2 = prng(vec3<f32>(sd + f32(k) * 13.0, cellId));

                var impulsePos = r1.xy;
                impulsePos = impulsePos + vec2<f32>(sin(t + r2.x * TAU), cos(t + r2.y * TAU)) * 0.15;

                let delta = neighbor + impulsePos - fr;

                let angle = mix(baseAngle, r2.z * TAU, iso);
                let dir = vec2<f32>(cos(angle), sin(angle));

                var weight = 1.0;
                if (r1.z < 0.5) { weight = -1.0; }

                let envelope = exp(-dot(delta, delta) / (2.0 * sigma * sigma));
                let phase = TAU * freq * dot(dir, delta);
                sum = sum + weight * envelope * cos(phase);
            }
        }
    }
    return sum;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    let seed = uniforms.data[0].w;

    let scale = uniforms.data[1].x;
    let orientation = uniforms.data[1].y;
    let bandwidth = uniforms.data[1].z;
    let isotropy = uniforms.data[1].w;

    let density = uniforms.data[2].x;
    let octaves = uniforms.data[2].y;
    let speed = uniforms.data[2].z;
    var st = pos.xy / resolution.y;

    let freq = map(scale, 1.0, 100.0, 20.0, 1.0);
    let sigma = map(bandwidth, 1.0, 100.0, 0.05, 0.35);
    let baseAngle = orientation * PI / 180.0;
    let iso = isotropy / 100.0;
    let impulses = i32(density);
    let oct = i32(octaves);
    let spd = floor(speed);
    let t = time * TAU * spd;

    var p = st * freq;

    // Fractal octave summation
    var value = 0.0;
    var amplitude = 1.0;
    var totalAmp = 0.0;
    var pOct = p;

    for (var i: i32 = 0; i < 5; i = i + 1) {
        if (i >= oct) { break; }
        let octFreq = 1.0 + f32(i) * 0.5;
        let octSigma = sigma / (1.0 + f32(i) * 0.5);
        let fi = f32(i);
        value = value + amplitude * gaborNoise(pOct, octFreq, octSigma, baseAngle, iso, impulses, t + fi * 3.7, seed + fi * 17.0);
        totalAmp = totalAmp + amplitude;
        amplitude = amplitude * 0.5;
        pOct = pOct * 2.0;
    }
    value = value / totalAmp;

    let n = 1.0 / (1.0 + exp(-value * 3.0));
    return vec4<f32>(vec3<f32>(n), 1.0);
}
