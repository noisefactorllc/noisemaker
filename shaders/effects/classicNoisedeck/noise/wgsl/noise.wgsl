/*
 * WGSL port of the animated noise synthesizer.
 */

struct Uniforms {
    data : array<vec4<f32>, 11>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

// NOISE_TYPE is a compile-time const injected by the runtime via injectDefines
// (see classicNoisedeck/noise/definition.js `globals.type.define`). Replacing
// the runtime dispatch with a compile-time constant lets the WGSL compiler
// constant-fold the variant selection — same fix as the GLSL backend (see
// classicNoisedeck/noise/glsl/noise.glsl header). The expander always provides
// this define for classicNoisedeck/noise programs.

var<private> resolution : vec2<f32>;
var<private> time : f32;
var<private> aspectRatio : f32;
var<private> xScale : f32;
var<private> yScale : f32;
var<private> seed : f32;
var<private> loopScale : f32;
var<private> speed : f32;
var<private> loopOffset : i32;
var<private> octaves : i32;
var<private> ridges : bool;
var<private> wrap : bool;
var<private> refractMode : i32;
var<private> refractAmt : f32;
var<private> kaleido : f32;
var<private> metric : i32;
var<private> colorMode : i32;
var<private> paletteMode : i32;
var<private> cyclePalette : i32;
var<private> rotatePalette : f32;
var<private> repeatPalette : f32;
var<private> hueRange : f32;
var<private> hueRotation : f32;
var<private> paletteOffset : vec3<f32>;
var<private> paletteAmp : vec3<f32>;
var<private> paletteFreq : vec3<f32>;
var<private> palettePhase : vec3<f32>;

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    p.x = select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0);
    p.y = select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0);
    p.z = select(-p.z * 2.0 + 1.0, p.z * 2.0, p.z >= 0.0);
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

fn random(st: vec2<f32>) -> f32 {
    return prng(vec3<f32>(st, 0.0)).x;
}

fn periodicFunction(p: f32) -> f32 {
    return map(cos(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

fn blendBicubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    // Cubic B-spline basis functions for uniform knots
    // Provides C² continuous smoothing
    let t2 = t * t;
    let t3 = t2 * t;
    
    let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let b3 = t3 / 6.0;
    
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

// Catmull-Rom 3-point interpolation (degree 3, C⁰ continuous)
// Interpolates through all 3 points
fn catmullRom3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    
    return p1 + 0.5 * t * (p2 - p0) + 
           0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) +
           0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

// Catmull-Rom 4-point interpolation (standard, tension=0.5)
// Interpolates through middle 2 points (p1, p2)
fn catmullRom4(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + 
           t * (3.0 * (p1 - p2) + p3 - p0)));
}

fn blendLinearOrCosine(a: f32, b: f32, amount: f32, interp: i32) -> f32 {
    if (interp == 1) {
        return mix(a, b, amount);
    }
    return mix(a, b, smoothstep(0.0, 1.0, amount));
}

fn positiveModulo(value: i32, modulus: i32) -> i32 {
    if (modulus == 0) {
        return 0;
    }

    var r = value % modulus;
    if (r < 0) {
        r += modulus;
    }
    return r;
}

fn constantFromLatticeWithOffset(lattice_in: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32, offset: vec2<i32>) -> f32 {
    let baseFloor = floor(lattice_in);
    var cell = vec2<i32>(i32(baseFloor.x), i32(baseFloor.y)) + offset;
    let frac = lattice_in - baseFloor;

    let seedInt = i32(floor(s));
    let sFrac = fract(s);

    let xCombined = frac.x + sFrac;
    var xi = cell.x + i32(floor(xCombined));
    var yi = cell.y;

    if (wrap) {
        let freqX = i32(freq.x + 0.5);
        let freqY = i32(freq.y + 0.5);

        if (freqX > 0) {
            xi = positiveModulo(xi, freqX);
        }
        if (freqY > 0) {
            yi = positiveModulo(yi, freqY);
        }
    }

    let xBits = bitcast<u32>(xi);
    let yBits = bitcast<u32>(yi);
    let seedBits = bitcast<u32>(seedInt);
    let fracBits = bitcast<u32>(sFrac);

    let jitter = vec3<u32>(
        (fracBits * 374761393u) ^ 0x9E3779B9u,
        (fracBits * 668265263u) ^ 0x7F4A7C15u,
        (fracBits * 2246822519u) ^ 0x94D049B4u
    );

    let prngState = pcg(vec3<u32>(xBits, yBits, seedBits) ^ jitter);
    let noiseValue = f32(prngState.x) / f32(0xffffffffu);

    return periodicFunction(noiseValue - blend);
}

fn constant(st_in: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st_in * freq;
    return constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(0, 0));
}

fn constantOffset(lattice: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32, offset: vec2<i32>) -> f32 {
    return constantFromLatticeWithOffset(lattice, freq, s, blend, offset);
}

fn mod289_3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_2(x: vec2<f32>) -> vec2<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute3(x: vec3<f32>) -> vec3<f32> {
    return mod289_3(((x * 34.0) + 1.0) * x);
}

// ---- 3×3 quadratic interpolation ----
// Replaces legacy bicubic 4×4 (16 taps) with 3×3 kernel (9 taps)
// Performance: ~1.8× faster in fBm chains
// Quality: Quadratic (degree 2) interpolation, minimum 3×3 kernel to avoid lattice artifacts

// Quadratic interpolation for 3 samples (degree 2 polynomial)
fn quadratic3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    // Quadratic B-spline interpolation (degree 2)
    // Smooth C¹ continuous blending between 3 control points
    // B-spline basis functions for uniform knots with t ∈ [0, 1]
    let t2 = t * t;
    
    // B-spline basis: B0 = (1-t)²/2, B1 = (-2t² + 2t + 1)/2, B2 = t²/2
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

fn cubic3x3ValueNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    
    // Sample 3×3 grid (9 taps)
    // Using constantFromLatticeWithOffset directly
    
    // Row -1 (y-1)
    let v00 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let v10 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0, -1));
    let v20 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1, -1));
    
    // Row 0 (y)
    let v01 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1,  0));
    let v11 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0,  0));
    let v21 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1,  0));
    
    // Row 1 (y+1)
    let v02 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1,  1));
    let v12 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0,  1));
    let v22 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1,  1));
    
    // Quadratic interpolation along x for each row
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    
    // Quadratic interpolation along y
    return quadratic3(y0, y1, y2, f.y);
}

// ---- End 3×3 quadratic ----


fn bicubicValue(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;

    let x0y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let x0y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 0));
    let x0y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 1));
    let x0y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 2));

    let x1y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, -1));
    let x1y1 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(0, 0));
    let x1y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 1));
    let x1y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 2));

    let x2y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, -1));
    let x2y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 0));
    let x2y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 1));
    let x2y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 2));

    let x3y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, -1));
    let x3y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, 0));
    let x3y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, 1));
    let x3y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, 2));

    let frac = fract(lattice);

    let y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, frac.x);
    let y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, frac.x);
    let y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, frac.x);
    let y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, frac.x);

    return blendBicubic(y0, y1, y2, y3, frac.y);
}

// 3×3 Catmull-Rom value noise (9 texture lookups)
fn catmullRom3x3ValueNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = vec2<f32>(st.x * freq.x + s, st.y * freq.y);
    
    // Sample 3×3 grid centered on current position
    let x0y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let x0y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 0));
    let x0y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 1));
    
    let x1y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, -1));
    let x1y1 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(0, 0));
    let x1y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 1));
    
    let x2y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, -1));
    let x2y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 0));
    let x2y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 1));
    
    let frac = fract(lattice);
    
    // Interpolate using 3-point Catmull-Rom
    let y0 = catmullRom3(x0y0, x1y0, x2y0, frac.x);
    let y1 = catmullRom3(x0y1, x1y1, x2y1, frac.x);
    let y2 = catmullRom3(x0y2, x1y2, x2y2, frac.x);
    
    return catmullRom3(y0, y1, y2, frac.y);
}

// 4×4 Catmull-Rom value noise (16 texture lookups)
fn catmullRom4x4ValueNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = vec2<f32>(st.x * freq.x + s, st.y * freq.y);
    
    // Sample 4×4 grid
    let x0y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let x0y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 0));
    let x0y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 1));
    let x0y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 2));

    let x1y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, -1));
    let x1y1 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(0, 0));
    let x1y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 1));
    let x1y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 2));

    let x2y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, -1));
    let x2y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 0));
    let x2y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 1));
    let x2y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 2));

    let x3y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, -1));
    let x3y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, 0));
    let x3y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, 1));
    let x3y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(2, 2));

    let frac = fract(lattice);

    // Interpolate using 4-point Catmull-Rom
    let y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, frac.x);
    let y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, frac.x);
    let y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, frac.x);
    let y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, frac.x);

    return catmullRom4(y0, y1, y2, y3, frac.y);
}

fn simplexValue(st_in: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    const C = vec4<f32>(
        0.211324865405187,
        0.366025403784439,
        -0.577350269189626,
        0.024390243902439
    );

    var uv = vec2<f32>(st_in.x * freq.x, st_in.y * freq.y);
    uv.x = uv.x + s;

    var i = floor(uv + dot(uv, C.yy));
    var x0 = uv - i + dot(i, C.xx);

    let i1 = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), x0.x > x0.y);
    let x1 = x0 - i1 + vec2<f32>(C.x, C.x);
    let x2 = x0 - vec2<f32>(1.0, 1.0) + vec2<f32>(2.0 * C.x, 2.0 * C.x);

    i = mod289_2(i);
    var p = permute3(permute3(i.y + vec3<f32>(0.0, i1.y, 1.0)) + i.x + vec3<f32>(0.0, i1.x, 1.0));

    var m = max(vec3<f32>(0.5) - vec3<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3<f32>(0.0));
    m = m * m;
    m = m * m;

    var x = 2.0 * fract(p * C.www) - 1.0;
    var h = abs(x) - 0.5;
    var ox = floor(x + 0.5);
    var a0 = x - ox;

    m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));

    var g = vec3<f32>(0.0);
    g.x = a0.x * x0.x + h.x * x0.y;
    let gyz = a0.yz * vec2<f32>(x1.x, x2.x) + h.yz * vec2<f32>(x1.y, x2.y);
    g.y = gyz.x;
    g.z = gyz.y;

    let v = 130.0 * dot(m, g);
    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

fn sineNoise(st_in: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    var st = st_in * freq;
    st.x = st.x + s;

    let a = blend;
    let b = blend;
    let c = 1.0 - blend;

    let r1 = prng(vec3<f32>(s, s, s)) * 0.75 + vec3<f32>(0.125, 0.125, 0.125);
    let r2 = prng(vec3<f32>(s + 10.0, s + 10.0, s + 10.0)) * 0.75 + vec3<f32>(0.125, 0.125, 0.125);
    let x = sin(r1.x * st.y + sin(r1.y * st.x + a) + sin(r1.z * st.x + b) + c);
    let y = sin(r2.x * st.x + sin(r2.y * st.y + b) + sin(r2.z * st.y + c) + a);
    return (x + y) * 0.5 + 0.5;
}

fn value(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    if (NOISE_TYPE == 3) {
        // 3×3 Catmull-Rom (9 taps)
        return catmullRom3x3ValueNoise(st, freq, s, blend);
    } else if (NOISE_TYPE == 4) {
        // 4×4 Catmull-Rom (16 taps)
        return catmullRom4x4ValueNoise(st, freq, s, blend);
    } else if (NOISE_TYPE == 5) {
        // 3×3 quadratic B-spline (9 taps)
        return cubic3x3ValueNoise(st, freq, s, blend);
    } else if (NOISE_TYPE == 6) {
        // 4×4 cubic B-spline (16 taps)
        return bicubicValue(st, freq, s, blend);
    } else if (NOISE_TYPE == 10) {
        return simplexValue(st, freq, s, blend);
    } else if (NOISE_TYPE == 11) {
        return sineNoise(st, freq, s, blend);
    }

    let lattice = st * freq;
    let x1y1 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(0, 0));
    if (NOISE_TYPE == 0) {
        return x1y1;
    }

    let x2y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 0));
    let x1y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 1));
    let x2y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 1));

    let frac = fract(lattice);
    let a = blendLinearOrCosine(x1y1, x2y1, frac.x, NOISE_TYPE);
    let b = blendLinearOrCosine(x1y2, x2y2, frac.x, NOISE_TYPE);
    return blendLinearOrCosine(a, b, frac.y, NOISE_TYPE);
}

fn circles(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return dist * freq;
}

fn rings(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return cos(dist * PI * freq);
}

fn diamonds(st_in: vec2<f32>, freq: f32) -> f32 {
    var st = st_in - vec2<f32>(0.5 * aspectRatio, 0.5);
    st = st * freq;
    return cos(st.x * PI) + cos(st.y * PI);
}

fn shape(st_in: vec2<f32>, sides: i32, blend: f32) -> f32 {
    let st = st_in * 2.0 - vec2<f32>(aspectRatio, 1.0);
    let a = atan2(st.x, st.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st) * blend;
}

fn getMetric(st_in: vec2<f32>) -> f32 {
    var st = st_in;
    let diff = vec2<f32>(0.5 * aspectRatio, 0.5) - st;
    var r = 1.0;
    if (metric == 0) {
        r = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    } else if (metric == 1) {
        r = abs(diff.x) + abs(diff.y);
    } else if (metric == 2) {
        r = max(max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y), max(abs(diff.x) - diff.y * 0.5, diff.y));
    } else if (metric == 3) {
        r = max((abs(diff.x) + abs(diff.y)) / sqrt(2.0), max(abs(diff.x), abs(diff.y)));
    } else if (metric == 4) {
        r = max(abs(diff.x), abs(diff.y));
    } else if (metric == 5) {
        r = max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y);
    }
    return r;
}

fn rotate2D(st: vec2<f32>, rot: f32) -> vec2<f32> {
    let angle = rot * PI;
    let c = cos(angle);
    let s = sin(angle);
    return mat2x2<f32>(c, -s, s, c) * st;
}

fn kaleidoscope(st_in: vec2<f32>, sides: f32, blendy: f32) -> vec2<f32> {
    if (sides == 1.0) {
        return st_in;
    }
    let r = getMetric(st_in) + blendy;
    var st = st_in - vec2<f32>(0.5 * aspectRatio, 0.5);
    st = rotate2D(st, 0.5);
    var a = atan2(st.y, st.x);
    let ma = abs(modulo(a - radians(360.0 / sides), TAU / sides) - PI / sides);
    return r * vec2<f32>(cos(ma), sin(ma));
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;

    let c = v * s;
    let h6 = h * 6.0;
    let k = h6 - 2.0 * floor(h6 / 2.0);
    let x = c * (1.0 - abs(k - 1.0));
    let m = v - c;

    var rgb = vec3<f32>(0.0);
    if (h6 < 1.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h6 < 2.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h6 < 3.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h6 < 4.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h6 < 5.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }
    return rgb + vec3<f32>(m, m, m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.x;
    let g = rgb.y;
    let b = rgb.z;
    let maxc = max(r, max(g, b));
    let minc = min(r, min(g, b));
    let delta = maxc - minc;

    var h = 0.0;
    if (delta != 0.0) {
        if (maxc == r) {
            h = modulo((g - b) / delta, 6.0) / 6.0;
        } else if (maxc == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }

    let s = select(delta / maxc, 0.0, maxc == 0.0);
    let v = maxc;
    return vec3<f32>(h, s, v);
}

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb = vec3<f32>(0.0);
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

fn srgbToLinear(srgb: vec3<f32>) -> vec3<f32> {
    var linear = vec3<f32>(0.0);
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

const fwdA = mat3x3<f32>(
    vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.3963377774, -0.1055613458, -0.0894841775),
    vec3<f32>(0.2158037573, -0.0638541728, -1.2914855480)
);

const fwdB = mat3x3<f32>(
    vec3<f32>(4.0767245293, -1.2681437731, -0.0041119885),
    vec3<f32>(-3.3072168827, 2.6093323231, -0.7034763098),
    vec3<f32>(0.2307590544, -0.3411344290, 1.7068625689)
);

const invB = mat3x3<f32>(
    vec3<f32>(0.4121656120, 0.2118591070, 0.0883097947),
    vec3<f32>(0.5362752080, 0.6807189584, 0.2818474174),
    vec3<f32>(0.0514575653, 0.1074065790, 0.6302613616)
);

const invA = mat3x3<f32>(
    vec3<f32>(0.2104542553, 1.9779984951, 0.0259040371),
    vec3<f32>(0.7936177850, -2.4285922050, 0.7827717662),
    vec3<f32>(-0.0040720468, 0.4505937099, -0.8086757660)
);

fn oklab_from_linear_srgb(c: vec3<f32>) -> vec3<f32> {
    let lms = invB * c;
    return invA * (sign(lms) * pow(abs(lms), vec3<f32>(0.3333333333333)));
}

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

fn pal(t_in: f32) -> vec3<f32> {
    var t = t_in * repeatPalette + rotatePalette * 0.01;
    var color = paletteOffset + paletteAmp * cos(6.28318 * (paletteFreq * t + palettePhase));

    if (paletteMode == 1) {
        color = hsv2rgb(color);
    } else if (paletteMode == 2) {
        color.y = color.y * -0.509 + 0.276;
        color.z = color.z * -0.509 + 0.198;
        color = linear_srgb_from_oklab(color);
        color = linearToSrgb(color);
    }

    return color;
}

fn generate_octave(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32, octave: f32) -> vec3<f32> {
    var layer = vec3<f32>(
        value(st, freq, seed + 10.0 * octave, blend),
        value(st, freq, seed + 20.0 * octave, blend),
        value(st, freq, seed + 30.0 * octave, blend)
    );
    if (ridges && colorMode == 6) {
        layer.z = 1.0 - abs(layer.z * 2.0 - 1.0);
    }
    return layer;
}

fn multires(st_in: vec2<f32>, freq: vec2<f32>, oct: i32, s: f32, blend: f32) -> vec3<f32> {
    var st = st_in;
    var color = vec3<f32>(0.0);
    var multiplicand = 0.0;
    var nominalFreq = vec2<f32>(0.0, 0.0);
    if (NOISE_TYPE == 11) {
        // Sine noise uses [40, 1]; pin refract defaults to its midpoint.
        let base = map(75.0, 1.0, 100.0, 40.0, 1.0);
        nominalFreq = vec2<f32>(base, base);
    } else if (NOISE_TYPE == 10) {
        // Simplex spans [6, 0.5]; keep axis ratios anchored to that midpoint.
        let base = map(75.0, 1.0, 100.0, 6.0, 0.5);
        nominalFreq = vec2<f32>(base, base);
    } else {
        // Value-noise flavours share [20, 3]; reuse midpoint for balanced distortion.
        let base = map(75.0, 1.0, 100.0, 20.0, 3.0);
        nominalFreq = vec2<f32>(base, base);
    }

    let total = max(oct, 1);
    for (var i: i32 = 1; i <= total; i = i + 1) {
        let multiplier = pow(2.0, f32(i));
        let baseFreq = freq * 0.5 * multiplier;
        let nominalBase = nominalFreq.x * 0.5 * multiplier;
        multiplicand = multiplicand + 1.0 / multiplier;

        if (refractMode == 1 || refractMode == 2) {
            let xRefractFreq = vec2<f32>(baseFreq.x, nominalBase);
            let yRefractFreq = vec2<f32>(nominalBase, baseFreq.y);
            let xRef = value(st, xRefractFreq, s + 10.0 * f32(i), blend) - 0.5;
            let yRef = value(st, yRefractFreq, s + 20.0 * f32(i), blend) - 0.5;
            let refraction = map(refractAmt, 0.0, 100.0, 0.0, 1.0) / multiplier;
            st = vec2<f32>(st.x + xRef * refraction, st.y + yRef * refraction);
        }

        var layer = generate_octave(st, baseFreq, s + 10.0 * f32(i), blend, f32(i));

        if (refractMode == 0 || refractMode == 2) {
            let xOff = cos(layer.z) * 0.5 + 0.5;
            let yOff = sin(layer.z) * 0.5 + 0.5;
            let refLayer = generate_octave(vec2<f32>(st.x + xOff, st.y + yOff), baseFreq, s + 15.0 * f32(i), blend, f32(i));
            let amt = map(refractAmt, 0.0, 100.0, 0.0, 1.0);
            layer = mix(layer, refLayer, vec3<f32>(amt));
        }

        color = color + layer / multiplier;
    }

    color = color / multiplicand;

    var result = color;
    if (colorMode == 0) {
        if (ridges) {
            result.z = 1.0 - abs(result.z * 2.0 - 1.0);
        }
        result = vec3<f32>(result.z);
    } else if (colorMode == 1) {
        result = srgbToLinear(result);
    } else if (colorMode == 2) {
        // srgb, no change
    } else if (colorMode == 3) {
        result.y = result.y * -0.509 + 0.276;
        result.z = result.z * -0.509 + 0.198;
        result = linear_srgb_from_oklab(result);
        result = linearToSrgb(result);
    } else if (colorMode == 4) {
        if (ridges) {
            result.z = 1.0 - abs(result.z * 2.0 - 1.0);
        }
        var d = result.z;
        if (cyclePalette == -1) {
            d = d + time;
        } else if (cyclePalette == 1) {
            d = d - time;
        }
        result = pal(d);
    } else {
        var hsv = result;
        hsv.x = hsv.x * hueRange * 0.01;
        hsv.x = hsv.x + 1.0 - (hueRotation / 360.0);
        result = hsv2rgb(hsv);
    }

    if (colorMode != 4 && colorMode != 6) {
        var hsv = rgb2hsv(result);
        hsv.x = hsv.x + 1.0 - (hueRotation / 360.0);
        hsv.x = fract(hsv.x);
        if (ridges && (colorMode == 1 || colorMode == 2 || colorMode == 3)) {
            hsv.z = 1.0 - abs(hsv.z * 2.0 - 1.0);
        }
        result = hsv2rgb(hsv);
    }

    return result;
}

fn offset(st_in: vec2<f32>, freq: vec2<f32>) -> f32 {
    if (loopOffset == 10) {
        return circles(st_in, freq.x);
    } else if (loopOffset == 20) {
        return shape(st_in, 3, freq.x * 0.5);
    } else if (loopOffset == 30) {
        return (abs(st_in.x - 0.5 * aspectRatio) + abs(st_in.y - 0.5)) * freq.x * 0.5;
    } else if (loopOffset == 40) {
        return shape(st_in, 4, freq.x * 0.5);
    } else if (loopOffset == 50) {
        return shape(st_in, 5, freq.x * 0.5);
    } else if (loopOffset == 60) {
        return shape(st_in, 6, freq.x * 0.5);
    } else if (loopOffset == 70) {
        return shape(st_in, 7, freq.x * 0.5);
    } else if (loopOffset == 80) {
        return shape(st_in, 8, freq.x * 0.5);
    } else if (loopOffset == 90) {
        return shape(st_in, 9, freq.x * 0.5);
    } else if (loopOffset == 100) {
        return shape(st_in, 10, freq.x * 0.5);
    } else if (loopOffset == 110) {
        return shape(st_in, 11, freq.x * 0.5);
    } else if (loopOffset == 120) {
        return shape(st_in, 12, freq.x * 0.5);
    } else if (loopOffset == 200) {
        return st_in.x * freq.x * 0.5;
    } else if (loopOffset == 210) {
        return st_in.y * freq.x * 0.5;
    } else if (loopOffset == 300) {
        let st = st_in - vec2<f32>(aspectRatio * 0.5, 0.5);
        return value(st, freq, seed + 50.0, 0.0);
    } else if (loopOffset == 400) {
        return 1.0 - rings(st_in, freq.x);
    } else if (loopOffset == 410) {
        return 1.0 - diamonds(st_in, freq.x);
    }
    return 0.0;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    aspectRatio = uniforms.data[0].w;
    xScale = uniforms.data[1].x;
    yScale = uniforms.data[1].y;
    seed = uniforms.data[1].z;
    loopScale = uniforms.data[1].w;
    speed = uniforms.data[2].x;
    loopOffset = i32(uniforms.data[2].y);
    octaves = max(1, i32(uniforms.data[2].w));
    ridges = uniforms.data[3].x > 0.5;
    wrap = uniforms.data[3].y > 0.5;
    refractMode = i32(uniforms.data[3].z);
    refractAmt = uniforms.data[3].w;
    kaleido = uniforms.data[4].x;
    metric = i32(uniforms.data[4].y);
    colorMode = i32(uniforms.data[4].z);
    paletteMode = i32(uniforms.data[4].w);
    cyclePalette = i32(uniforms.data[5].x);
    rotatePalette = uniforms.data[5].y;
    repeatPalette = uniforms.data[5].z;
    hueRange = uniforms.data[5].w;
    hueRotation = uniforms.data[6].x;
    paletteOffset = uniforms.data[7].xyz;
    paletteAmp = uniforms.data[8].xyz;
    paletteFreq = uniforms.data[9].xyz;
    palettePhase = uniforms.data[10].xyz;

    var st = pos.xy / resolution.y;
    st = kaleidoscope(st, kaleido, 0.5);
    let centered = st - vec2<f32>(aspectRatio * 0.5, 0.5);

    var freq = vec2<f32>(1.0, 1.0);
    var lf = vec2<f32>(1.0, 1.0);

    if (NOISE_TYPE == 11) {
        freq.x = map(xScale, 1.0, 100.0, 40.0, 1.0);
        freq.y = map(yScale, 1.0, 100.0, 40.0, 1.0);
        let val = map(loopScale, 1.0, 100.0, 10.0, 1.0);
        lf = vec2<f32>(val, val);
    } else if (NOISE_TYPE == 10) {
        freq.x = map(xScale, 1.0, 100.0, 6.0, 0.5);
        freq.y = map(yScale, 1.0, 100.0, 6.0, 0.5);
        let val = map(loopScale, 1.0, 100.0, 6.0, 0.5);
        lf = vec2<f32>(val, val);
    } else {
        freq.x = map(xScale, 1.0, 100.0, 20.0, 3.0);
        freq.y = map(yScale, 1.0, 100.0, 20.0, 3.0);
        let val = map(loopScale, 1.0, 100.0, 12.0, 3.0);
        lf = vec2<f32>(val, val);
    }

    if (loopOffset == 300) {
        var nominalFreq = vec2<f32>(1.0, 1.0);
        if (NOISE_TYPE == 11) {
            // Sine noise maps into a wide [40, 1] range, so reuse its midpoint to match the field frequency.
            let base = map(75.0, 1.0, 100.0, 40.0, 1.0);
            nominalFreq = vec2<f32>(base, base);
        } else if (NOISE_TYPE == 10) {
            // Simplex maps into [6, 0.5]; anchoring to its midpoint keeps loop stretch aligned with the main noise.
            let base = map(75.0, 1.0, 100.0, 6.0, 0.5);
            nominalFreq = vec2<f32>(base, base);
        } else {
            // All other value-noise flavours share the [20, 3] range, so lock to that midpoint.
            let base = map(75.0, 1.0, 100.0, 20.0, 3.0);
            nominalFreq = vec2<f32>(base, base);
        }
        // Mirror the main noise's per-axis stretch without cross-coupling sliders.
        lf = lf * (freq / nominalFreq);
    }

    if (NOISE_TYPE != 4 && NOISE_TYPE != 10 && wrap) {
        freq = floor(freq);
        if (loopOffset == 300) {
            lf = floor(lf);
        }
    }

    var t = 1.0;
    if (speed < 0.0) {
        t = time + offset(st, lf);
    } else {
        t = time - offset(st, lf);
    }
    let blend = periodicFunction(t) * abs(speed) * 0.01;

    let colorRgb = multires(centered, freq, octaves, seed, blend);
    var color = vec4<f32>(colorRgb, 1.0);

    return color;
}
