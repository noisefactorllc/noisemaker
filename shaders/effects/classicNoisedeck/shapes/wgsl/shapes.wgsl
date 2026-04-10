/*
 * WGSL shapes generator shader.
 * Matches the GLSL logic for procedural primitives with deterministic hashing so cross-backend renders stay identical.
 * All coordinate transforms are aspect-aware to prevent stretching when the module feeds either WebGL or WebGPU pipelines.
 */

struct Uniforms {
    data : array<vec4<f32>, 7>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

// LOOP_A_OFFSET and LOOP_B_OFFSET are compile-time consts injected by the
// runtime via injectDefines(). See classicNoisedeck/shapes/definition.js
// `globals.LOOP_A_OFFSET.define` / `globals.LOOP_B_OFFSET.define`.

var<private> resolution : vec2<f32>;
var<private> time : f32;
var<private> seed : f32;
var<private> wrap : bool;
var<private> loopAScale : f32;
var<private> loopBScale : f32;
var<private> speedA : f32;
var<private> speedB : f32;
var<private> paletteMode : i32;
var<private> paletteOffset : vec3<f32>;
var<private> paletteAmp : vec3<f32>;
var<private> paletteFreq : vec3<f32>;
var<private> palettePhase : vec3<f32>;
var<private> cyclePalette : i32;
var<private> rotatePalette : f32;
var<private> repeatPalette : f32;
var<private> aspectRatio : f32;

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn rotate2D(st_in: vec2<f32>, rot: f32) -> vec2<f32> {
    var st = st_in;
    var angle = rot * PI;
    st = st - vec2<f32>(0.5 - aspectRatio, 0.5);
    let s = sin(angle);
    let c = cos(angle);
    st = mat2x2<f32>(c, -s, s, c) * st;
    st = st + vec2<f32>(0.5 - aspectRatio, 0.5);
    return st;
}

fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
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

fn random(st: vec2<f32>) -> f32 {
    return prng(vec3<f32>(st, 0.0)).x;
}

fn periodicFunction(p: f32) -> f32 {
    let x = TAU * p;
    return map(sin(x), -1.0, 1.0, 0.0, 1.0);
}

fn constant(st_in: vec2<f32>, freq: f32, speed: f32) -> f32 {
    var x = st_in.x * freq;
    var y = st_in.y * freq;
    if (wrap) {
        x = modulo(x, freq);
        y = modulo(y, freq);
    }
    x = x + seed;
    let rand = prng(vec3<f32>(floor(vec2<f32>(x, y)), seed));
    let scaledTime = periodicFunction(rand.x - time) * map(abs(speed), 0.0, 100.0, 0.0, 0.33);
    return periodicFunction(rand.y - scaledTime);
}

// ---- 3×3 quadratic interpolation ----
// Replaces legacy bicubic 4×4 (16 taps) with 3×3 kernel (9 taps)
// Performance: ~1.8× faster
// Quality: Quadratic B-spline (degree 2) smoothing, C¹ continuous

// Quadratic B-spline basis functions for 3 samples
fn quadratic3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

// Catmull-Rom 3-point interpolation (degree 3, C⁰ continuous)
fn catmullRom3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    
    return p1 + 0.5 * t * (p2 - p0) + 
           0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) +
           0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

fn quadratic3x3Value(st: vec2<f32>, freq: f32, speed: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    
    let nd = 1.0 / freq;
    
    // Sample 3×3 grid (9 taps)
    // Row -1 (y-1)
    let v00 = constant(st + vec2<f32>(-nd, -nd), freq, speed);
    let v10 = constant(st + vec2<f32>(0.0, -nd), freq, speed);
    let v20 = constant(st + vec2<f32>(nd, -nd), freq, speed);
    
    // Row 0 (y)
    let v01 = constant(st + vec2<f32>(-nd, 0.0), freq, speed);
    let v11 = constant(st, freq, speed);
    let v21 = constant(st + vec2<f32>(nd, 0.0), freq, speed);
    
    // Row 1 (y+1)
    let v02 = constant(st + vec2<f32>(-nd, nd), freq, speed);
    let v12 = constant(st + vec2<f32>(0.0, nd), freq, speed);
    let v22 = constant(st + vec2<f32>(nd, nd), freq, speed);
    
    // Quadratic interpolation along x for each row
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    
    // Quadratic interpolation along y
    return quadratic3(y0, y1, y2, f.y);
}

fn catmullRom3x3Value(st: vec2<f32>, freq: f32, speed: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    
    let nd = 1.0 / freq;
    
    // Sample 3×3 grid (9 taps)
    let v00 = constant(st + vec2<f32>(-nd, -nd), freq, speed);
    let v10 = constant(st + vec2<f32>(0.0, -nd), freq, speed);
    let v20 = constant(st + vec2<f32>(nd, -nd), freq, speed);
    
    let v01 = constant(st + vec2<f32>(-nd, 0.0), freq, speed);
    let v11 = constant(st, freq, speed);
    let v21 = constant(st + vec2<f32>(nd, 0.0), freq, speed);
    
    let v02 = constant(st + vec2<f32>(-nd, nd), freq, speed);
    let v12 = constant(st + vec2<f32>(0.0, nd), freq, speed);
    let v22 = constant(st + vec2<f32>(nd, nd), freq, speed);
    
    let y0 = catmullRom3(v00, v10, v20, f.x);
    let y1 = catmullRom3(v01, v11, v21, f.x);
    let y2 = catmullRom3(v02, v12, v22, f.x);
    
    return catmullRom3(y0, y1, y2, f.y);
}

// ---- End 3×3 interpolation ----

fn blendBicubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    
    let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let b3 = t3 / 6.0;
    
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

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

fn bicubicValue(st: vec2<f32>, freq: f32, speed: f32) -> f32 {
    let ndX = 1.0 / freq;
    let ndY = 1.0 / freq;

    let u0 = st.x - ndX;
    let u1 = st.x;
    let u2 = st.x + ndX;
    let u3 = st.x + ndX + ndX;

    let v0 = st.y - ndY;
    let v1 = st.y;
    let v2 = st.y + ndY;
    let v3 = st.y + ndY + ndY;

    let x0y0 = constant(vec2<f32>(u0, v0), freq, speed);
    let x0y1 = constant(vec2<f32>(u0, v1), freq, speed);
    let x0y2 = constant(vec2<f32>(u0, v2), freq, speed);
    let x0y3 = constant(vec2<f32>(u0, v3), freq, speed);

    let x1y0 = constant(vec2<f32>(u1, v0), freq, speed);
    let x1y1 = constant(st, freq, speed);
    let x1y2 = constant(vec2<f32>(u1, v2), freq, speed);
    let x1y3 = constant(vec2<f32>(u1, v3), freq, speed);

    let x2y0 = constant(vec2<f32>(u2, v0), freq, speed);
    let x2y1 = constant(vec2<f32>(u2, v1), freq, speed);
    let x2y2 = constant(vec2<f32>(u2, v2), freq, speed);
    let x2y3 = constant(vec2<f32>(u2, v3), freq, speed);

    let x3y0 = constant(vec2<f32>(u3, v0), freq, speed);
    let x3y1 = constant(vec2<f32>(u3, v1), freq, speed);
    let x3y2 = constant(vec2<f32>(u3, v2), freq, speed);
    let x3y3 = constant(vec2<f32>(u3, v3), freq, speed);

    let uv = st * freq;

    let y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    let y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    let y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    let y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return blendBicubic(y0, y1, y2, y3, fract(uv.y));
}

fn catmullRom4x4Value(st: vec2<f32>, freq: f32, speed: f32) -> f32 {
    // Neighbor Distance
    let ndX = 1.0 / freq;
    let ndY = 1.0 / freq;

    let u0 = st.x - ndX;
    let u1 = st.x;
    let u2 = st.x + ndX;
    let u3 = st.x + ndX + ndX;

    let v0 = st.y - ndY;
    let v1 = st.y;
    let v2 = st.y + ndY;
    let v3 = st.y + ndY + ndY;

    let x0y0 = constant(vec2<f32>(u0, v0), freq, speed);
    let x0y1 = constant(vec2<f32>(u0, v1), freq, speed);
    let x0y2 = constant(vec2<f32>(u0, v2), freq, speed);
    let x0y3 = constant(vec2<f32>(u0, v3), freq, speed);

    let x1y0 = constant(vec2<f32>(u1, v0), freq, speed);
    let x1y1 = constant(st, freq, speed);
    let x1y2 = constant(vec2<f32>(u1, v2), freq, speed);
    let x1y3 = constant(vec2<f32>(u1, v3), freq, speed);

    let x2y0 = constant(vec2<f32>(u2, v0), freq, speed);
    let x2y1 = constant(vec2<f32>(u2, v1), freq, speed);
    let x2y2 = constant(vec2<f32>(u2, v2), freq, speed);
    let x2y3 = constant(vec2<f32>(u2, v3), freq, speed);

    let x3y0 = constant(vec2<f32>(u3, v0), freq, speed);
    let x3y1 = constant(vec2<f32>(u3, v1), freq, speed);
    let x3y2 = constant(vec2<f32>(u3, v2), freq, speed);
    let x3y3 = constant(vec2<f32>(u3, v3), freq, speed);

    let uv = st * freq;

    let y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    let y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    let y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    let y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return catmullRom4(y0, y1, y2, y3, fract(uv.y));
}

// Simplex 2D - MIT License
fn mod289_3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_2(x: vec2<f32>) -> vec2<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute3(x: vec3<f32>) -> vec3<f32> {
    return mod289_3(((x * 34.0) + 1.0) * x);
}

fn simplexValue(st_in: vec2<f32>, freq: f32, s: f32, blend: f32) -> f32 {
    const C = vec4<f32>(
        0.211324865405187,
        0.366025403784439,
        -0.577350269189626,
        0.024390243902439
    );

    var uv = vec2<f32>(st_in.x * freq, st_in.y * freq);
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

fn sineNoise(st_in: vec2<f32>, freq: f32, s: f32, blend: f32) -> f32 {
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

fn value(st: vec2<f32>, freq: f32, interp: i32, speed: f32) -> f32 {
    if (interp == 3) {
        // 3×3 Catmull-Rom (9 taps)
        return catmullRom3x3Value(st, freq, speed);
    } else if (interp == 4) {
        // 4×4 Catmull-Rom (16 taps)
        return catmullRom4x4Value(st, freq, speed);
    } else if (interp == 5) {
        // 3×3 quadratic B-spline (9 taps)
        return quadratic3x3Value(st, freq, speed);
    } else if (interp == 6) {
        // 4×4 cubic B-spline (16 taps)
        return bicubicValue(st, freq, speed);
    } else if (interp == 10) {
        // simplex
        let scaledTime = periodicFunction(time) * map(abs(speed), 0.0, 100.0, 0.0, 0.333);
        return simplexValue(st, freq, seed, scaledTime);
    } else if (interp == 11) {
        // sine
        let scaledTime = periodicFunction(time) * map(abs(speed), 0.0, 100.0, 0.0, 0.333);
        return sineNoise(st, freq, seed, scaledTime);
    }
    let x1y1 = constant(st, freq, speed);
    if (interp == 0) {
        return x1y1;
    }
    let ndX = 1.0 / freq;
    let ndY = 1.0 / freq;
    let x1y2 = constant(vec2<f32>(st.x, st.y + ndY), freq, speed);
    let x2y1 = constant(vec2<f32>(st.x + ndX, st.y), freq, speed);
    let x2y2 = constant(vec2<f32>(st.x + ndX, st.y + ndY), freq, speed);
    let uv = st * freq;
    let a = blendLinearOrCosine(x1y1, x2y1, fract(uv.x), interp);
    let b = blendLinearOrCosine(x1y2, x2y2, fract(uv.x), interp);
    return blendLinearOrCosine(a, b, fract(uv.y), interp);
}

fn circles(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return dist * freq;
}

fn rings(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return cos(dist * PI * freq);
}

fn diamonds(st: vec2<f32>, freq: f32) -> f32 {
    var st2 = st;
    st2 = st2 - vec2<f32>(0.5 * aspectRatio, 0.5);
    st2 = st2 * freq;
    return cos(st2.x * PI) + cos(st2.y * PI);
}

fn shape(st: vec2<f32>, sides: i32, blend: f32) -> f32 {
    var st2 = st * 2.0 - vec2<f32>(aspectRatio, 1.0);
    let a = atan2(st2.x, st2.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st2) * blend;
}

fn offset(st: vec2<f32>, freq: f32, loopOffset: i32, speed: f32, seedIn: f32) -> f32 {
    if (loopOffset == 10) {
        return circles(st, freq);
    } else if (loopOffset == 20) {
        return shape(st, 3, freq * 0.5);
    } else if (loopOffset == 30) {
        return (abs(st.x - 0.5 * aspectRatio) + abs(st.y - 0.5)) * freq * 0.5;
    } else if (loopOffset >= 40 && loopOffset <= 120) {
        let sides = loopOffset / 10;
        return shape(st, sides, freq * 0.5);
    } else if (loopOffset == 200) {
        return st.x * freq * 0.5;
    } else if (loopOffset == 210) {
        return st.y * freq * 0.5;
    } else if (loopOffset >= 300 && loopOffset <= 380) {
        let idx = (loopOffset - 300) / 10;
        let interp = select(idx + 3, idx, idx <= 6);
        let f = select(freq, map(freq, 1.0, 6.0, 1.0, 20.0), loopOffset == 300);
        return 1.0 - value(st + vec2<f32>(seedIn, seedIn), f, interp, speed);
    } else if (loopOffset == 400) {
        return 1.0 - rings(st, freq);
    } else if (loopOffset == 410) {
        return 1.0 - diamonds(st, freq);
    }
    return 0.0;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;

    let c = v * s;
    let x = c * (1.0 - abs(modulo(h * 6.0, 2.0) - 1.0));
    let m = v - c;

    var rgb = vec3<f32>(0.0);
    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb + vec3<f32>(m, m, m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;

    let maxc = max(r, max(g, b));
    let minc = min(r, min(g, b));
    let delta = maxc - minc;

    var h = 0.0;
    if (delta != 0.0) {
        if (maxc == r) {
            h = modulo((g - b) / delta, 6.0) / 6.0;
        } else if (maxc == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (maxc == b) {
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

// oklab transform and inverse
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

fn pal(t: f32) -> vec3<f32> {
    var tt = t * repeatPalette + rotatePalette * 0.01;
    var color = paletteOffset + paletteAmp * cos(6.28318 * (paletteFreq * tt + palettePhase));

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

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    seed = uniforms.data[0].w;

    wrap = uniforms.data[1].x > 0.5;
    loopAScale = uniforms.data[1].w;

    loopBScale = uniforms.data[2].x;
    speedA = uniforms.data[2].y;
    speedB = uniforms.data[2].z;
    paletteMode = i32(uniforms.data[2].w);

    paletteOffset = uniforms.data[3].xyz;
    cyclePalette = i32(uniforms.data[3].w);

    paletteAmp = uniforms.data[4].xyz;
    rotatePalette = uniforms.data[4].w;

    paletteFreq = uniforms.data[5].xyz;
    repeatPalette = uniforms.data[5].w;

    palettePhase = uniforms.data[6].xyz;

    aspectRatio = resolution.x / resolution.y;

    var color = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var st = pos.xy / resolution.y;

    var lf1 = map(loopAScale, 1.0, 100.0, 6.0, 1.0);
    if (wrap) {
        lf1 = floor(lf1);
        if (LOOP_A_OFFSET >= 200 && LOOP_A_OFFSET < 300) {
            lf1 = lf1 * 2.0;
        }
    }
    let amp1 = map(abs(speedA), 0.0, 100.0, 0.0, 1.0);
    var t1 = 1.0;
    if (speedA < 0.0) {
        t1 = time + offset(st, lf1, LOOP_A_OFFSET, amp1, seed);
    } else if (speedA > 0.0) {
        t1 = time - offset(st, lf1, LOOP_A_OFFSET, amp1, seed);
    }

    var lf2 = map(loopBScale, 1.0, 100.0, 6.0, 1.0);
    if (wrap) {
        lf2 = floor(lf2);
        if (LOOP_B_OFFSET >= 200 && LOOP_B_OFFSET < 300) {
            lf2 = lf2 * 2.0;
        }
    }
    let amp2 = map(abs(speedB), 0.0, 100.0, 0.0, 1.0);
    var t2 = 1.0;
    if (speedB < 0.0) {
        t2 = time + offset(st, lf2, LOOP_B_OFFSET, amp2, seed + 10.0);
    } else if (speedB > 0.0) {
        t2 = time - offset(st, lf2, LOOP_B_OFFSET, amp2, seed + 10.0);
    }

    let a = periodicFunction(t1) * amp1;
    let b = periodicFunction(t2) * amp2;

    var d = abs((a + b) - 1.0);
    if (cyclePalette == -1) {
        d = d + time;
    } else if (cyclePalette == 1) {
        d = d - time;
    }
    color = vec4<f32>(pal(d), color.a);

    var st2 = pos.xy / resolution;

    return color;
}
