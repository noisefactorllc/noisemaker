/*
 * VNoise - WGSL port of simplified value noise synthesizer.
 * From nd/noise with colorization simplified to mono and rgb only.
 */

struct Uniforms {
    data : array<vec4<f32>, 4>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

// NOISE_TYPE is a compile-time const injected by the runtime via injectDefines
// (see synth/noise/definition.js `globals.type.define`). Replacing the runtime
// dispatch with a compile-time constant lets the WGSL compiler dead-code-eliminate
// the unused noise variants — same fix as the GLSL backend (see noise.glsl header
// comment). The expander always provides this define for synth/noise programs.

var<private> resolution : vec2<f32>;
var<private> time : f32;
var<private> aspectRatio : f32;
var<private> scaleX : f32;
var<private> scaleY : f32;
var<private> seed : f32;
var<private> loopScale : f32;
var<private> speed : f32;
var<private> loopOffset : i32;
var<private> octaves : i32;
var<private> ridges : bool;
var<private> wrap : bool;
var<private> colorMode : i32;

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
    let t2 = t * t;
    let t3 = t2 * t;
    let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let b3 = t3 / 6.0;
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

fn catmullRom3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    return p1 + 0.5 * t * (p2 - p0) + 
           0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) +
           0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

fn catmullRom4(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}

fn quadratic3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

fn blendLinearOrCosine(a: f32, b: f32, amount: f32, nType: i32) -> f32 {
    if (nType == 1) { return mix(a, b, amount); }
    return mix(a, b, smoothstep(0.0, 1.0, amount));
}

fn positiveModulo(value: i32, modulus: i32) -> i32 {
    if (modulus == 0) { return 0; }
    var r = value % modulus;
    if (r < 0) { r = r + modulus; }
    return r;
}

fn constantFromLatticeWithOffset(lattice: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32, offset: vec2<i32>) -> f32 {
    let baseFloor = floor(lattice);
    let base = vec2<i32>(baseFloor) + offset;
    let fr = lattice - baseFloor;
    let seedInt = i32(floor(s));
    let sFrac = fract(s);
    let xCombined = fr.x + sFrac;
    var xi = base.x + i32(floor(xCombined));
    var yi = base.y;

    if (wrap) {
        let freqX = i32(freq.x + 0.5);
        let freqY = i32(freq.y + 0.5);
        if (freqX > 0) { xi = positiveModulo(xi, freqX); }
        if (freqY > 0) { yi = positiveModulo(yi, freqY); }
    }

    let xBits = u32(xi);
    let yBits = u32(yi);
    let seedBits = u32(seedInt);
    let fracBits = bitcast<u32>(sFrac);

    let jitter = vec3<u32>(
        (fracBits * 374761393u) ^ 0x9E3779B9u,
        (fracBits * 668265263u) ^ 0x7F4A7C15u,
        (fracBits * 2246822519u) ^ 0x94D049B4u
    );

    let state = vec3<u32>(xBits, yBits, seedBits) ^ jitter;
    let prngState = pcg(state);
    let noiseValue = f32(prngState.x) / f32(0xffffffffu);
    return periodicFunction(noiseValue - blend);
}

fn constantFromLattice(lattice: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    return constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(0, 0));
}

fn constant(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;
    return constantFromLattice(lattice, freq, s, blend);
}

fn constantOffset(lattice: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32, offset: vec2<i32>) -> f32 {
    return constantFromLatticeWithOffset(lattice, freq, s, blend, offset);
}

fn cubic3x3ValueNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    let v00 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let v10 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0, -1));
    let v20 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1, -1));
    let v01 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1,  0));
    let v11 = constantFromLattice(lattice, freq, s, blend);
    let v21 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1,  0));
    let v02 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1,  1));
    let v12 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0,  1));
    let v22 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1,  1));
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    return quadratic3(y0, y1, y2, f.y);
}

fn bicubicValue(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;
    let x0y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let x0y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 0));
    let x0y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 1));
    let x0y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 2));
    let x1y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, -1));
    let x1y1 = constantFromLattice(lattice, freq, s, blend);
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
    let fr = fract(lattice);
    let y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, fr.x);
    let y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, fr.x);
    let y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, fr.x);
    let y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, fr.x);
    return blendBicubic(y0, y1, y2, y3, fr.y);
}

fn catmullRom3x3ValueNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;
    let f = fract(lattice);
    let v00 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let v10 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0, -1));
    let v20 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1, -1));
    let v01 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1,  0));
    let v11 = constantFromLattice(lattice, freq, s, blend);
    let v21 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1,  0));
    let v02 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>(-1,  1));
    let v12 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 0,  1));
    let v22 = constantFromLatticeWithOffset(lattice, freq, s, blend, vec2<i32>( 1,  1));
    let y0 = catmullRom3(v00, v10, v20, f.x);
    let y1 = catmullRom3(v01, v11, v21, f.x);
    let y2 = catmullRom3(v02, v12, v22, f.x);
    return catmullRom3(y0, y1, y2, f.y);
}

fn catmullRom4x4ValueNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let lattice = st * freq;
    let x0y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, -1));
    let x0y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 0));
    let x0y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 1));
    let x0y3 = constantOffset(lattice, freq, s, blend, vec2<i32>(-1, 2));
    let x1y0 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, -1));
    let x1y1 = constantFromLattice(lattice, freq, s, blend);
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
    let fr = fract(lattice);
    let y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, fr.x);
    let y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, fr.x);
    let y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, fr.x);
    let y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, fr.x);
    return catmullRom4(y0, y1, y2, y3, fr.y);
}

fn mod289v3(x: vec3<f32>) -> vec3<f32> { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289v2(x: vec2<f32>) -> vec2<f32> { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute(x: vec3<f32>) -> vec3<f32> { return mod289v3(((x*34.0)+1.0)*x); }

fn simplexValue(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    let C = vec4<f32>(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    var uv = st * freq;
    uv.x += s;
    let i = floor(uv + dot(uv, C.yy));
    let x0 = uv - i + dot(i, C.xx);
    let i1 = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), x0.x > x0.y);
    var x12 = x0.xyxy + C.xxzz;
    x12 = vec4<f32>(x12.xy - i1, x12.zw);
    let ii = mod289v2(i);
    let p = permute(permute(ii.y + vec3<f32>(0.0, i1.y, 1.0)) + ii.x + vec3<f32>(0.0, i1.x, 1.0));
    var m = max(vec3<f32>(0.5) - vec3<f32>(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), vec3<f32>(0.0));
    m = m*m;
    m = m*m;
    let x = 2.0 * fract(p * C.www) - 1.0;
    let h = abs(x) - 0.5;
    let ox = floor(x + 0.5);
    let a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    var g: vec3<f32>;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.y = a0.y * x12.x + h.y * x12.y;
    g.z = a0.z * x12.z + h.z * x12.w;
    let v = 130.0 * dot(m, g);
    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

fn sineNoise(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    var stt = st * freq;
    stt.x += s;
    let a = blend;
    let b = blend;
    let c = 1.0 - blend;
    let r1 = prng(vec3<f32>(s, s, s)) * 0.75 + 0.125;
    let r2 = prng(vec3<f32>(s + 10.0, s + 10.0, s + 10.0)) * 0.75 + 0.125;
    let x = sin(r1.x * stt.y + sin(r1.y * stt.x + a) + sin(r1.z * stt.x + b) + c);
    let y = sin(r2.x * stt.x + sin(r2.y * stt.y + b) + sin(r2.z * stt.y + c) + a);
    return (x + y) * 0.5 + 0.5;
}

fn value(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32) -> f32 {
    if (NOISE_TYPE == 3) { return catmullRom3x3ValueNoise(st, freq, s, blend); }
    if (NOISE_TYPE == 4) { return catmullRom4x4ValueNoise(st, freq, s, blend); }
    if (NOISE_TYPE == 5) { return cubic3x3ValueNoise(st, freq, s, blend); }
    if (NOISE_TYPE == 6) { return bicubicValue(st, freq, s, blend); }
    if (NOISE_TYPE == 10) { return simplexValue(st, freq, s, blend); }
    if (NOISE_TYPE == 11) { return sineNoise(st, freq, s, blend); }

    let lattice = st * freq;
    let x1y1 = constantFromLattice(lattice, freq, s, blend);
    if (NOISE_TYPE == 0) { return x1y1; }

    let x2y1 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 0));
    let x1y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(0, 1));
    let x2y2 = constantOffset(lattice, freq, s, blend, vec2<i32>(1, 1));
    let fr = fract(lattice);
    let aa = blendLinearOrCosine(x1y1, x2y1, fr.x, NOISE_TYPE);
    let bb = blendLinearOrCosine(x1y2, x2y2, fr.x, NOISE_TYPE);
    return blendLinearOrCosine(aa, bb, fr.y, NOISE_TYPE);
}

fn circles(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return dist * freq;
}

fn rings(st: vec2<f32>, freq: f32) -> f32 {
    let dist = length(st - vec2<f32>(0.5 * aspectRatio, 0.5));
    return cos(dist * PI * freq);
}

fn diamonds(st: vec2<f32>, freq: f32, pos: vec2<f32>) -> f32 {
    var stt = pos / resolution.y;
    stt -= vec2<f32>(0.5 * aspectRatio, 0.5);
    stt *= freq;
    return (cos(stt.x * PI) + cos(stt.y * PI));
}

fn shape(st: vec2<f32>, sides: i32, blend: f32) -> f32 {
    let stt = st * 2.0 - vec2<f32>(aspectRatio, 1.0);
    let a = atan2(stt.x, stt.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(stt) * blend;
}

fn offset(st: vec2<f32>, freq: vec2<f32>, pos: vec2<f32>) -> f32 {
    if (loopOffset == 10) { return circles(st, freq.x); }
    if (loopOffset == 20) { return shape(st, 3, freq.x * 0.5); }
    if (loopOffset == 30) { return (abs(st.x - 0.5 * aspectRatio) + abs(st.y - 0.5)) * freq.x * 0.5; }
    if (loopOffset == 40) { return shape(st, 4, freq.x * 0.5); }
    if (loopOffset == 50) { return shape(st, 5, freq.x * 0.5); }
    if (loopOffset == 60) { return shape(st, 6, freq.x * 0.5); }
    if (loopOffset == 70) { return shape(st, 7, freq.x * 0.5); }
    if (loopOffset == 80) { return shape(st, 8, freq.x * 0.5); }
    if (loopOffset == 90) { return shape(st, 9, freq.x * 0.5); }
    if (loopOffset == 100) { return shape(st, 10, freq.x * 0.5); }
    if (loopOffset == 110) { return shape(st, 11, freq.x * 0.5); }
    if (loopOffset == 120) { return shape(st, 12, freq.x * 0.5); }
    if (loopOffset == 200) { return st.x * freq.x * 0.5; }
    if (loopOffset == 210) { return st.y * freq.x * 0.5; }
    if (loopOffset == 300) {
        let stt = st - vec2<f32>(aspectRatio * 0.5, 0.5);
        return value(stt, freq, seed + 50.0, 0.0);
    }
    if (loopOffset == 400) { return 1.0 - rings(st, freq.x); }
    if (loopOffset == 410) { return 1.0 - diamonds(st, freq.x, pos); }
    return 0.0;
}

fn generate_octave(st: vec2<f32>, freq: vec2<f32>, s: f32, blend: f32, layer: f32) -> vec3<f32> {
    var color = vec3<f32>(0.0);
    color.r = value(st, freq, s, blend);
    color.g = value(st, freq, s + 10.0, blend);
    color.b = value(st, freq, s + 20.0, blend);
    return color;
}

fn multires(st_in: vec2<f32>, freq: vec2<f32>, oct: i32, s: f32, blend: f32) -> vec3<f32> {
    let st = st_in;
    var color = vec3<f32>(0.0);
    var multiplicand = 0.0;

    for (var i = 1; i <= oct; i++) {
        let multiplier = pow(2.0, f32(i));
        let baseFreq = freq * 0.5 * multiplier;
        multiplicand += 1.0 / multiplier;

        let layer = generate_octave(st, baseFreq, s + 10.0 * f32(i), blend, f32(i));

        color = color + layer / multiplier;
    }

    color = color / multiplicand;
    
    // Simplified colorization: mono (0) or rgb (1) only
    if (colorMode == 0) {
        // mono - use blue channel
        var b = color.b;
        if (ridges) { b = 1.0 - abs(b * 2.0 - 1.0); }
        return vec3<f32>(b);
    } else {
        // rgb
        if (ridges) {
            color.r = 1.0 - abs(color.r * 2.0 - 1.0);
            color.g = 1.0 - abs(color.g * 2.0 - 1.0);
            color.b = 1.0 - abs(color.b * 2.0 - 1.0);
        }
        return color;
    }
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    aspectRatio = uniforms.data[0].w;
    scaleX = uniforms.data[1].x;
    scaleY = uniforms.data[1].y;
    seed = uniforms.data[1].z;
    loopScale = uniforms.data[1].w;
    speed = uniforms.data[2].x;
    loopOffset = i32(uniforms.data[2].y);
    octaves = i32(uniforms.data[2].w);
    ridges = uniforms.data[3].x > 0.5;
    wrap = uniforms.data[3].y > 0.5;
    colorMode = i32(uniforms.data[3].z);

    var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    var st = position.xy / resolution.y;
    let centered = st - vec2<f32>(aspectRatio * 0.5, 0.5);

    var freq = vec2<f32>(1.0);
    var lf = vec2<f32>(1.0);

    if (NOISE_TYPE == 11) {
        freq.x = map(scaleX, 1.0, 100.0, 40.0, 1.0);
        freq.y = map(scaleY, 1.0, 100.0, 40.0, 1.0);
        lf = vec2<f32>(map(loopScale, 1.0, 100.0, 10.0, 1.0));
    } else if (NOISE_TYPE == 10) {
        freq.x = map(scaleX, 1.0, 100.0, 6.0, 0.5);
        freq.y = map(scaleY, 1.0, 100.0, 6.0, 0.5);
        lf = vec2<f32>(map(loopScale, 1.0, 100.0, 6.0, 0.5));
    } else {
        freq.x = map(scaleX, 1.0, 100.0, 20.0, 3.0);
        freq.y = map(scaleY, 1.0, 100.0, 20.0, 3.0);
        lf = vec2<f32>(map(loopScale, 1.0, 100.0, 12.0, 3.0));
    }

    if (loopOffset == 300) {
        var nominalFreq = vec2<f32>(1.0);
        if (NOISE_TYPE == 11) {
            let base = map(75.0, 1.0, 100.0, 40.0, 1.0);
            nominalFreq = vec2<f32>(base);
        } else if (NOISE_TYPE == 10) {
            let base = map(75.0, 1.0, 100.0, 6.0, 0.5);
            nominalFreq = vec2<f32>(base);
        } else {
            let base = map(75.0, 1.0, 100.0, 20.0, 3.0);
            nominalFreq = vec2<f32>(base);
        }
        lf *= freq / nominalFreq;
    }

    if (NOISE_TYPE != 4 && NOISE_TYPE != 10 && wrap) {
        freq = floor(freq);
        if (loopOffset == 300) {
            lf = floor(lf);
        }
    }

    var t = 1.0;
    if (speed < 0.0) {
        t = time + offset(st, lf, position.xy);
    } else {
        t = time - offset(st, lf, position.xy);
    }
    let blend = periodicFunction(t) * abs(speed) * 0.01;

    color = vec4<f32>(multires(centered, freq, octaves, seed, blend), 1.0);
    return color;
}
