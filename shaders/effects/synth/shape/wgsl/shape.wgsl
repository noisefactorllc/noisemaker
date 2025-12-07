/*
 * WGSL shape generator shader (mono-only variant).
 * Removed: palette colorization, hsv/oklab conversion
 * Output: grayscale intensity based on offset pattern
 */

struct Uniforms {
    data : array<vec4<f32>, 3>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

var<private> resolution : vec2<f32>;
var<private> time : f32;
var<private> seed : f32;
var<private> wrap : bool;
var<private> loopAOffset : i32;
var<private> loopBOffset : i32;
var<private> loopAScale : f32;
var<private> loopBScale : f32;
var<private> loopAAmp : f32;
var<private> loopBAmp : f32;
var<private> aspectRatio : f32;

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

fn periodicFunction(p: f32) -> f32 {
    let x = TAU * p;
    return map(sin(x), -1.0, 1.0, 0.0, 1.0);
}

fn constant(st_in: vec2<f32>, freq: f32, loopAmp: f32) -> f32 {
    var x = st_in.x * freq;
    var y = st_in.y * freq;
    if (wrap) {
        x = modulo(x, freq);
        y = modulo(y, freq);
    }
    x = x + seed;
    let rand = prng(vec3<f32>(floor(vec2<f32>(x, y)), seed));
    let scaledTime = periodicFunction(rand.x - time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.33);
    return periodicFunction(rand.y - scaledTime);
}

// ---- 3×3 quadratic interpolation ----
fn quadratic3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

fn catmullRom3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    return p1 + 0.5 * t * (p2 - p0) + 
           0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) +
           0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

fn quadratic3x3Value(st: vec2<f32>, freq: f32, loopAmp: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    let nd = 1.0 / freq;
    
    let v00 = constant(st + vec2<f32>(-nd, -nd), freq, loopAmp);
    let v10 = constant(st + vec2<f32>(0.0, -nd), freq, loopAmp);
    let v20 = constant(st + vec2<f32>(nd, -nd), freq, loopAmp);
    
    let v01 = constant(st + vec2<f32>(-nd, 0.0), freq, loopAmp);
    let v11 = constant(st, freq, loopAmp);
    let v21 = constant(st + vec2<f32>(nd, 0.0), freq, loopAmp);
    
    let v02 = constant(st + vec2<f32>(-nd, nd), freq, loopAmp);
    let v12 = constant(st + vec2<f32>(0.0, nd), freq, loopAmp);
    let v22 = constant(st + vec2<f32>(nd, nd), freq, loopAmp);
    
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    
    return quadratic3(y0, y1, y2, f.y);
}

fn catmullRom3x3Value(st: vec2<f32>, freq: f32, loopAmp: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    let nd = 1.0 / freq;
    
    let v00 = constant(st + vec2<f32>(-nd, -nd), freq, loopAmp);
    let v10 = constant(st + vec2<f32>(0.0, -nd), freq, loopAmp);
    let v20 = constant(st + vec2<f32>(nd, -nd), freq, loopAmp);
    
    let v01 = constant(st + vec2<f32>(-nd, 0.0), freq, loopAmp);
    let v11 = constant(st, freq, loopAmp);
    let v21 = constant(st + vec2<f32>(nd, 0.0), freq, loopAmp);
    
    let v02 = constant(st + vec2<f32>(-nd, nd), freq, loopAmp);
    let v12 = constant(st + vec2<f32>(0.0, nd), freq, loopAmp);
    let v22 = constant(st + vec2<f32>(nd, nd), freq, loopAmp);
    
    let y0 = catmullRom3(v00, v10, v20, f.x);
    let y1 = catmullRom3(v01, v11, v21, f.x);
    let y2 = catmullRom3(v02, v12, v22, f.x);
    
    return catmullRom3(y0, y1, y2, f.y);
}

// ---- 4×4 interpolation ----
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

// Simplex 2D noise helpers
fn mod289_v3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_v2(x: vec2<f32>) -> vec2<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec3<f32>) -> vec3<f32> {
    return mod289_v3(((x * 34.0) + 1.0) * x);
}

fn simplexValue(st: vec2<f32>, freq: f32, s: f32, blend: f32) -> f32 {
    let C = vec4<f32>(0.211324865405187,
                      0.366025403784439,
                     -0.577350269189626,
                      0.024390243902439);

    var uv = st * freq;
    uv.x = uv.x + s;

    let i = floor(uv + dot(uv, C.yy));
    let x0 = uv - i + dot(i, C.xx);

    var i1: vec2<f32>;
    if (x0.x > x0.y) {
        i1 = vec2<f32>(1.0, 0.0);
    } else {
        i1 = vec2<f32>(0.0, 1.0);
    }
    var x12 = x0.xyxy + C.xxzz;
    x12 = vec4<f32>(x12.xy - i1, x12.zw);

    let i_mod = mod289_v2(i);
    let p = permute(permute(i_mod.y + vec3<f32>(0.0, i1.y, 1.0))
          + i_mod.x + vec3<f32>(0.0, i1.x, 1.0));

    var m = max(0.5 - vec3<f32>(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3<f32>(0.0));
    m = m * m;
    m = m * m;

    let x = 2.0 * fract(p * C.www) - 1.0;
    let h = abs(x) - 0.5;
    let ox = floor(x + 0.5);
    let a0 = x - ox;

    m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));

    var g: vec3<f32>;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.y = a0.y * x12.x + h.y * x12.y;
    g.z = a0.z * x12.z + h.z * x12.w;

    let v = 130.0 * dot(m, g);

    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

fn sineNoise(st_in: vec2<f32>, freq: f32, s: f32, blend: f32) -> f32 {
    var st = st_in * freq;
    st.x = st.x + s;

    let a = blend;
    let b = blend;
    let c = 1.0 - blend;

    let r1 = prng(vec3<f32>(s, 0.0, 0.0)) * 0.75 + 0.125;
    let r2 = prng(vec3<f32>(s + 10.0, 0.0, 0.0)) * 0.75 + 0.125;
    let x = sin(r1.x * st.y + sin(r1.y * st.x + a) + sin(r1.z * st.x + b) + c);
    let y = sin(r2.x * st.x + sin(r2.y * st.y + b) + sin(r2.z * st.y + c) + a);

    return (x + y) * 0.5 + 0.5;
}

fn bicubicValue(st: vec2<f32>, freq: f32, loopAmp: f32) -> f32 {
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

    let x0y0 = constant(vec2<f32>(u0, v0), freq, loopAmp);
    let x0y1 = constant(vec2<f32>(u0, v1), freq, loopAmp);
    let x0y2 = constant(vec2<f32>(u0, v2), freq, loopAmp);
    let x0y3 = constant(vec2<f32>(u0, v3), freq, loopAmp);

    let x1y0 = constant(vec2<f32>(u1, v0), freq, loopAmp);
    let x1y1 = constant(st, freq, loopAmp);
    let x1y2 = constant(vec2<f32>(u1, v2), freq, loopAmp);
    let x1y3 = constant(vec2<f32>(u1, v3), freq, loopAmp);

    let x2y0 = constant(vec2<f32>(u2, v0), freq, loopAmp);
    let x2y1 = constant(vec2<f32>(u2, v1), freq, loopAmp);
    let x2y2 = constant(vec2<f32>(u2, v2), freq, loopAmp);
    let x2y3 = constant(vec2<f32>(u2, v3), freq, loopAmp);

    let x3y0 = constant(vec2<f32>(u3, v0), freq, loopAmp);
    let x3y1 = constant(vec2<f32>(u3, v1), freq, loopAmp);
    let x3y2 = constant(vec2<f32>(u3, v2), freq, loopAmp);
    let x3y3 = constant(vec2<f32>(u3, v3), freq, loopAmp);

    let uv = st * freq;

    let y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    let y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    let y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    let y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return blendBicubic(y0, y1, y2, y3, fract(uv.y));
}

fn catmullRom4x4Value(st: vec2<f32>, freq: f32, loopAmp: f32) -> f32 {
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

    let x0y0 = constant(vec2<f32>(u0, v0), freq, loopAmp);
    let x0y1 = constant(vec2<f32>(u0, v1), freq, loopAmp);
    let x0y2 = constant(vec2<f32>(u0, v2), freq, loopAmp);
    let x0y3 = constant(vec2<f32>(u0, v3), freq, loopAmp);

    let x1y0 = constant(vec2<f32>(u1, v0), freq, loopAmp);
    let x1y1 = constant(st, freq, loopAmp);
    let x1y2 = constant(vec2<f32>(u1, v2), freq, loopAmp);
    let x1y3 = constant(vec2<f32>(u1, v3), freq, loopAmp);

    let x2y0 = constant(vec2<f32>(u2, v0), freq, loopAmp);
    let x2y1 = constant(vec2<f32>(u2, v1), freq, loopAmp);
    let x2y2 = constant(vec2<f32>(u2, v2), freq, loopAmp);
    let x2y3 = constant(vec2<f32>(u2, v3), freq, loopAmp);

    let x3y0 = constant(vec2<f32>(u3, v0), freq, loopAmp);
    let x3y1 = constant(vec2<f32>(u3, v1), freq, loopAmp);
    let x3y2 = constant(vec2<f32>(u3, v2), freq, loopAmp);
    let x3y3 = constant(vec2<f32>(u3, v3), freq, loopAmp);

    let uv = st * freq;

    let y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    let y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    let y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    let y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return catmullRom4(y0, y1, y2, y3, fract(uv.y));
}

fn value(st: vec2<f32>, freq: f32, interp: i32, loopAmp: f32) -> f32 {
    if (interp == 3) {
        return catmullRom3x3Value(st, freq, loopAmp);
    } else if (interp == 4) {
        return catmullRom4x4Value(st, freq, loopAmp);
    } else if (interp == 5) {
        return quadratic3x3Value(st, freq, loopAmp);
    } else if (interp == 6) {
        return bicubicValue(st, freq, loopAmp);
    } else if (interp == 10) {
        let scaledTime = periodicFunction(time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.333);
        return simplexValue(st, freq, seed, scaledTime);
    } else if (interp == 11) {
        let scaledTime = periodicFunction(time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.333);
        return sineNoise(st, freq, seed, scaledTime);
    }

    let x1y1 = constant(st, freq, loopAmp);

    if (interp == 0) {
        return x1y1;
    }

    let ndX = 1.0 / freq;
    let ndY = 1.0 / freq;

    let x1y2 = constant(vec2<f32>(st.x, st.y + ndY), freq, loopAmp);
    let x2y1 = constant(vec2<f32>(st.x + ndX, st.y), freq, loopAmp);
    let x2y2 = constant(vec2<f32>(st.x + ndX, st.y + ndY), freq, loopAmp);

    let uv = st * freq;

    let a = blendLinearOrCosine(x1y1, x2y1, fract(uv.x), interp);
    let b = blendLinearOrCosine(x1y2, x2y2, fract(uv.x), interp);

    return blendLinearOrCosine(a, b, fract(uv.y), interp);
}

// Shape functions
fn circles(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return dist * freq;
}

fn rings(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return cos(dist * PI * freq);
}

fn diamonds(pos: vec4<f32>, freq: f32) -> f32 {
    var stLocal = pos.xy / resolution.y;
    stLocal = stLocal - vec2<f32>(0.5 * aspectRatio, 0.5);
    stLocal = stLocal * freq;
    return (cos(stLocal.x * PI) + cos(stLocal.y * PI));
}

fn shape(st: vec2<f32>, sides: i32, blend: f32) -> f32 {
    let stLocal = st * 2.0 - vec2<f32>(aspectRatio, 1.0);
    let a = atan2(stLocal.x, stLocal.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(stLocal) * blend;
}

fn offset(st: vec2<f32>, freq: f32, loopOffset: i32, loopAmp: f32, seedVal: f32, pos: vec4<f32>) -> f32 {
    if (loopOffset == 10) {
        return circles(st, freq);
    } else if (loopOffset == 20) {
        return shape(st, 3, freq * 0.5);
    } else if (loopOffset == 30) {
        return (abs(st.x - 0.5 * aspectRatio) + abs(st.y - 0.5)) * freq * 0.5;
    } else if (loopOffset == 40) {
        return shape(st, 4, freq * 0.5);
    } else if (loopOffset == 50) {
        return shape(st, 5, freq * 0.5);
    } else if (loopOffset == 60) {
        return shape(st, 6, freq * 0.5);
    } else if (loopOffset == 70) {
        return shape(st, 7, freq * 0.5);
    } else if (loopOffset == 80) {
        return shape(st, 8, freq * 0.5);
    } else if (loopOffset == 90) {
        return shape(st, 9, freq * 0.5);
    } else if (loopOffset == 100) {
        return shape(st, 10, freq * 0.5);
    } else if (loopOffset == 110) {
        return shape(st, 11, freq * 0.5);
    } else if (loopOffset == 120) {
        return shape(st, 12, freq * 0.5);
    } else if (loopOffset == 200) {
        return st.x * freq * 0.5;
    } else if (loopOffset == 210) {
        return st.y * freq * 0.5;
    } else if (loopOffset == 300) {
        let localFreq = map(freq, 1.0, 6.0, 1.0, 20.0);
        return 1.0 - value(st + seedVal, localFreq, 0, loopAmp);
    } else if (loopOffset == 310) {
        return 1.0 - value(st + seedVal, freq, 1, loopAmp);
    } else if (loopOffset == 320) {
        return 1.0 - value(st + seedVal, freq, 2, loopAmp);
    } else if (loopOffset == 330) {
        return 1.0 - value(st + seedVal, freq, 3, loopAmp);
    } else if (loopOffset == 340) {
        return 1.0 - value(st + seedVal, freq, 4, loopAmp);
    } else if (loopOffset == 350) {
        return 1.0 - value(st + seedVal, freq, 5, loopAmp);
    } else if (loopOffset == 360) {
        return 1.0 - value(st + seedVal, freq, 6, loopAmp);
    } else if (loopOffset == 370) {
        return 1.0 - value(st + seedVal, freq, 10, loopAmp);
    } else if (loopOffset == 380) {
        return 1.0 - value(st + seedVal, freq, 11, loopAmp);
    } else if (loopOffset == 400) {
        return 1.0 - rings(st, freq);
    } else if (loopOffset == 410) {
        return 1.0 - diamonds(pos, freq);
    }
    return 0.0;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    seed = uniforms.data[0].w;

    wrap = uniforms.data[1].x > 0.5;
    loopAOffset = i32(uniforms.data[1].y);
    loopBOffset = i32(uniforms.data[1].z);
    loopAScale = uniforms.data[1].w;

    loopBScale = uniforms.data[2].x;
    loopAAmp = uniforms.data[2].y;
    loopBAmp = uniforms.data[2].z;
    // Slot [2].w unused (was paletteMode)

    // Slots [3] and [4] unused (were palette parameters)

    aspectRatio = resolution.x / resolution.y;

    var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    var st = pos.xy / resolution.y;

    var lf1 = map(loopAScale, 1.0, 100.0, 6.0, 1.0);
    if (wrap) {
        lf1 = floor(lf1);
        if (loopAOffset >= 200 && loopAOffset < 300) {
            lf1 = lf1 * 2.0;
        }
    }
    let amp1 = map(abs(loopAAmp), 0.0, 100.0, 0.0, 1.0);
    var t1 = 1.0;
    if (loopAAmp < 0.0) {
        t1 = time + offset(st, lf1, loopAOffset, amp1, seed, pos);
    } else if (loopAAmp > 0.0) {
        t1 = time - offset(st, lf1, loopAOffset, amp1, seed, pos);
    }

    var lf2 = map(loopBScale, 1.0, 100.0, 6.0, 1.0);
    if (wrap) {
        lf2 = floor(lf2);
        if (loopBOffset >= 200 && loopBOffset < 300) {
            lf2 = lf2 * 2.0;
        }
    }
    let amp2 = map(abs(loopBAmp), 0.0, 100.0, 0.0, 1.0);
    var t2 = 1.0;
    if (loopBAmp < 0.0) {
        t2 = time + offset(st, lf2, loopBOffset, amp2, seed + 10.0, pos);
    } else if (loopBAmp > 0.0) {
        t2 = time - offset(st, lf2, loopBOffset, amp2, seed + 10.0, pos);
    }

    let a = periodicFunction(t1) * amp1;
    let b = periodicFunction(t2) * amp2;

    let d = abs((a + b) - 1.0);

    // Mono output: grayscale intensity
    color = vec4<f32>(vec3<f32>(d), 1.0);

    return color;
}
