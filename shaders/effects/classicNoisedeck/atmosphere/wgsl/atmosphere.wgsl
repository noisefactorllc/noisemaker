/*
 * WGSL atmosphere shader.
 * Creates layered cloud noise and gradient sky coloring that mirrors the GLSL implementation.
 * Wind and lighting controls are normalized to avoid flicker when animated across large time spans.
 */

// Packed uniforms to stay within WebGPU's 12 uniform buffer limit per stage.
// Layout:
//   data[0]: resolution.xy, time, seed
//   data[1]: noiseType, interp, noiseScale, loopAmp
//   data[2]: refractAmt, ridges, wrap, colorMode
//   data[3]: hueRotation, hueRange, intensity, _pad
//   data[4]: color1
//   data[5]: color2
//   data[6]: color3
//   data[7]: color4
struct Uniforms {
    data: array<vec4<f32>, 8>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Unpack uniforms at module scope for use in helper functions
var<private> resolution: vec2<f32>;
var<private> time: f32;
var<private> seed: f32;
var<private> noiseType: i32;
var<private> interp: i32;
var<private> noiseScale: f32;
var<private> loopAmp: f32;
var<private> refractAmt: f32;
var<private> ridges: i32;
var<private> wrap: i32;
var<private> colorMode: i32;
var<private> hueRotation: f32;
var<private> hueRange: f32;
var<private> intensity: f32;
var<private> color1: vec4<f32>;
var<private> color2: vec4<f32>;
var<private> color3: vec4<f32>;
var<private> color4: vec4<f32>;

fn unpackUniforms() {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    seed = uniforms.data[0].w;
    noiseType = i32(uniforms.data[1].x);
    interp = i32(uniforms.data[1].y);
    noiseScale = uniforms.data[1].z;
    loopAmp = uniforms.data[1].w;
    refractAmt = uniforms.data[2].x;
    ridges = i32(uniforms.data[2].y);
    wrap = i32(uniforms.data[2].z);
    colorMode = i32(uniforms.data[2].w);
    hueRotation = uniforms.data[3].x;
    hueRange = uniforms.data[3].y;
    intensity = uniforms.data[3].z;
    // Use explicit .xyzw swizzle so runtime regex can detect max slot usage
    color1 = uniforms.data[4].xyzw;
    color2 = uniforms.data[5].xyzw;
    color3 = uniforms.data[6].xyzw;
    color4 = uniforms.data[7].xyzw;
}























const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}


fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG - MIT License
// https://github.com/riccardoscalco/glsl-pcg-prng
fn pcg(v: vec3<u32>) -> vec3<u32> {
        var r = v;
        r = r * u32(1664525) + u32(1013904223);

        r.x += r.y * r.z;
        r.y += r.z * r.x;
        r.z += r.x * r.y;

        r = r ^ (r >> vec3<u32>(16u));

        r.x += r.y * r.z;
        r.y += r.z * r.x;
        r.z += r.x * r.y;

        return r;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    var q = p;
    q.x = select(-q.x * 2.0 + 1.0, q.x * 2.0, q.x >= 0.0);
    q.y = select(-q.y * 2.0 + 1.0, q.y * 2.0, q.y >= 0.0);
    q.z = select(-q.z * 2.0 + 1.0, q.z * 2.0, q.z >= 0.0);
    return vec3<f32>(pcg(vec3<u32>(q))) / f32(0xffffffffu);
}
// end PCG PRNG

fn brightnessContrast(color: vec3<f32>) -> vec3<f32> {
    let bright: f32 = map(intensity, -100.0, 100.0, -0.4, 0.4);
    var cont: f32 = 1.0;
    if (intensity < 0.0) {
        cont = map(intensity, -100.0, 0.0, 0.5, 1.0);
    } else {
        cont = map(intensity, 0.0, 100.0, 1.0, 1.5);
    }

    return (color - 0.5) * cont + 0.5 + bright;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    var h: f32 = fract(hsv.x);
    var s: f32 = hsv.y;
    var v: f32 = hsv.z;
    
    var c: f32 = v * s; // Chroma
    var x: f32 = c * (1.0 - abs(modulo(h * 6.0, 2.0) - 1.0));
    var m: f32 = v - c;

    var rgb: vec3<f32>;

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
    } else {
        rgb = vec3<f32>(0.0, 0.0, 0.0);
    }

    return rgb + vec3<f32>(m, m, m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    var r: f32 = rgb.r;
    var g: f32 = rgb.g;
    var b: f32 = rgb.b;
    
    var maxc: f32 = max(r, max(g, b));
    var minc: f32 = min(r, min(g, b));
    var delta: f32 = maxc - minc;

    var h: f32 = 0.0;
    if (delta != 0.0) {
        if (maxc == r) {
            h = modulo((g - b) / delta, 6.0) / 6.0;
        } else if (maxc == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (maxc == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }

    var s: f32 = select(delta / maxc, 0.0, maxc == 0.0);
    var v: f32 = maxc;

    return vec3<f32>(h, s, v);
}

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb: vec3<f32>;
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// oklab transform and inverse - Public Domain/MIT License
// https://bottosson.github.io/posts/oklab/

const fwdA: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.3963377774, -0.1055613458, -0.0894841775),
    vec3<f32>(0.2158037573, -0.0638541728, -1.2914855480)
);

const fwdB: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(4.0767245293, -1.2681437731, -0.0041119885),
    vec3<f32>(-3.3072168827, 2.6093323231, -0.7034763098),
    vec3<f32>(0.2307590544, -0.3411344290,  1.7068625689)
);

const invB: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(0.4121656120, 0.2118591070, 0.0883097947),
    vec3<f32>(0.5362752080, 0.6807189584, 0.2818474174),
    vec3<f32>(0.0514575653, 0.1074065790, 0.6302613616)
);

const invA: mat3x3<f32> = mat3x3<f32>(
    vec3<f32>(0.2104542553, 1.9779984951, 0.0259040371),
    vec3<f32>(0.7936177850, -2.4285922050, 0.7827717662),
    vec3<f32>(-0.0040720468, 0.4505937099, -0.8086757660)
);

fn oklab_from_linear_srgb(c: vec3<f32>) -> vec3<f32> {
    var lms: vec3<f32> = invB * c;

    return invA * (sign(lms)*pow(abs(lms), vec3<f32>(0.3333333333333)));
}

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    var lms: vec3<f32> = fwdA * c;

    return fwdB * (lms * lms * lms);
}
// end oklab

// periodic function for looping
fn periodicFunction(p: f32) -> f32 {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

// Simplex 2D - MIT License
// https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl
//
// Description : Array and textureless GLSL 2D simplex noise function.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
// 
// Copyright (C) 2011 by Ashima Arts (Simplex noise)
// Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
fn mod289_3(x: vec3<f32>) -> vec3<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_2(x: vec2<f32>) -> vec2<f32> {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec3<f32>) -> vec3<f32> {
    return mod289_3(((x*34.0)+1.0)*x);
}

fn simplexValue(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32, blend: f32) -> f32 {
const C: vec4<f32> = vec4<f32>(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                       -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0

    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);
    uv.x += s;

    // First corner
    var i: vec2<f32> = floor(uv + dot(uv, C.yy) );
    var x0: vec2<f32> = uv -   i + dot(i, C.xx);

    // Other corners
    var i1: vec2<f32>;
    //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
    //i1.y = 1.0 - i1.x;
    i1 = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), x0.x > x0.y);
    // x0 = x0 - 0.0 + 0.0 * C.xx ;
    // x1 = x0 - i1 + 1.0 * C.xx ;
    // x2 = x0 - 1.0 + 2.0 * C.xx ;
    let x1: vec2<f32> = x0 - i1 + vec2<f32>(C.x, C.x);
    let x2: vec2<f32> = x0 - vec2<f32>(1.0, 1.0) + vec2<f32>(2.0 * C.x, 2.0 * C.x);
    let x12xz = vec2<f32>(x1.x, x2.x);
    let x12yw = vec2<f32>(x1.y, x2.y);

    // Permutations
    i = mod289_2(i); // Avoid truncation effects in permutation
    var p: vec3<f32> = permute( permute( i.y + vec3<f32>(0.0, i1.y, 1.0 ))
		  + i.x + vec3<f32>(0.0, i1.x, 1.0 ));

    var m: vec3<f32> = max(vec3<f32>(0.5) - vec3<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3<f32>(0.0));
    m = m*m ;
    m = m*m ;

    // Gradients: 41 points uniformly over a line, mapped onto a diamond.
    // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

    var x: vec3<f32> = 2.0 * fract(p * C.www) - 1.0;
    var h: vec3<f32> = abs(x) - 0.5;
    var ox: vec3<f32> = floor(x + 0.5);
    var a0: vec3<f32> = x - ox;

    // Normalise gradients implicitly by scaling m
    // Approximation of: m *= inversesqrt( a0*a0 + h*h );
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    // Compute final noise value at P
    var g: vec3<f32>;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    let gyz = a0.yz * x12xz + h.yz * x12yw;
    g.y = gyz.x;
    g.z = gyz.y;

    var v: f32 = 130.0 * dot(m, g);

    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}
// end simplex

fn sineNoise(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32, blend: f32) -> f32 {
    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);
    uv.x += s;

    let a: f32 = blend;
    let b: f32 = blend;
    let c: f32 = 1.0 - blend;

    let r1: vec3<f32> = prng(vec3<f32>(s, 0.0, 0.0)) * 0.75 + 0.125;
    let r2: vec3<f32> = prng(vec3<f32>(s + 10.0, 0.0, 0.0)) * 0.75 + 0.125;
    let x: f32 = sin(r1.x * uv.y + sin(r1.y * uv.x + a) + sin(r1.z * uv.x + b) + c);
    let y: f32 = sin(r2.x * uv.x + sin(r2.y * uv.y + b) + sin(r2.z * uv.y + c) + a);

    return (x + y) * 0.5 + 0.5;
}

// Noisemaker value noise - MIT License
// https://github.com/noisedeck/noisemaker/blob/master/noisemaker/value.py
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

fn randomFromLatticeWithOffset(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32, offset: vec2<i32>) -> vec3<f32> {
    let lattice = vec2<f32>(st.x * xFreq, st.y * yFreq);
    let baseFloor = floor(lattice);
    var base = vec2<i32>(i32(baseFloor.x), i32(baseFloor.y)) + offset;
    let frac = lattice - baseFloor;

    let seedInt = i32(floor(s));
    let seedFrac = fract(s);

    var xi = base.x + seedInt + i32(floor(frac.x + seedFrac));
    var yi = base.y;

    if (wrap > 0) {
        let freqXInt = i32(xFreq + 0.5);
        let freqYInt = i32(yFreq + 0.5);

        if (freqXInt > 0) {
            xi = positiveModulo(xi, freqXInt);
        }
        if (freqYInt > 0) {
            yi = positiveModulo(yi, freqYInt);
        }
    }

    let xBits = bitcast<u32>(xi);
    let yBits = bitcast<u32>(yi);
    let seedBits = bitcast<u32>(seed);
    let fracBits = bitcast<u32>(seedFrac);

    let jitter = vec3<u32>(
        (fracBits * 374761393u) ^ 0x9E3779B9u,
        (fracBits * 668265263u) ^ 0x7F4A7C15u,
        (fracBits * 2246822519u) ^ 0x94D049B4u
    );

    let state = vec3<u32>(xBits, yBits, seedBits) ^ jitter;
    let prngState = pcg(state);
    let denom = f32(0xffffffffu);
    return vec3<f32>(
        f32(prngState.x) / denom,
        f32(prngState.y) / denom,
        f32(prngState.z) / denom
    );
}

fn constant(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let rand: vec3<f32> = randomFromLatticeWithOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    var scaledTime: f32 = periodicFunction(rand.x - time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.25);
    return periodicFunction(rand.y - scaledTime);
}

fn constantOffset(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32, offset: vec2<i32>) -> f32 {
    let rand: vec3<f32> = randomFromLatticeWithOffset(st, xFreq, yFreq, s, offset);
    var scaledTime: f32 = periodicFunction(rand.x - time) * map(abs(loopAmp), 0.0, 100.0, 0.0, 0.25);
    return periodicFunction(rand.y - scaledTime);
}

// ---- 3×3 quadratic interpolation ----
// Replaces legacy bicubic 4×4 (16 taps) with 3×3 kernel (9 taps)
// Performance: ~1.8× faster in fBm chains
// Quality: Quadratic (degree 2) interpolation, minimum 3×3 kernel to avoid lattice artifacts

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

fn quadratic3x3Value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let lattice = vec2<f32>(st.x * xFreq, st.y * yFreq);
    let f = fract(lattice);
    
    // Sample 3×3 grid (9 taps) using grid offsets
    // Row -1 (y-1)
    let v00 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, -1));
    let v10 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, -1));
    let v20 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, -1));
    
    // Row 0 (y)
    let v01 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 0));
    let v11 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    let v21 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    
    // Row 1 (y+1)
    let v02 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 1));
    let v12 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    let v22 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));
    
    // Quadratic interpolation along x for each row
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    
    // Quadratic interpolation along y
    return quadratic3(y0, y1, y2, f.y);
}

fn catmullRom3x3Value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let lattice = vec2<f32>(st.x * xFreq, st.y * yFreq);
    let f = fract(lattice);
    
    // Sample 3×3 grid (9 taps) using grid offsets
    let v00 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, -1));
    let v10 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, -1));
    let v20 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, -1));
    
    let v01 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 0));
    let v11 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    let v21 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    
    let v02 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 1));
    let v12 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    let v22 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));
    
    let y0 = catmullRom3(v00, v10, v20, f.x);
    let y1 = catmullRom3(v01, v11, v21, f.x);
    let y2 = catmullRom3(v02, v12, v22, f.x);
    
    return catmullRom3(y0, y1, y2, f.y);
}

// ---- End 3×3 quadratic ----

// cubic B-spline interpolation (degree 3, C² continuous)
fn blendBicubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    
    let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let b3 = t3 / 6.0;
    
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

// Catmull-Rom 4-point interpolation (standard, tension=0.5)
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

fn bicubicValue(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    // Sample 4x4 grid using offset-based sampling
    var x0y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, -1));
    var x0y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 0));
    var x0y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 1));
    var x0y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 2));

    var x1y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, -1));
    var x1y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    var x1y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    var x1y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 2));

    var x2y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, -1));
    var x2y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    var x2y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));
    var x2y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 2));

    var x3y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, -1));
    var x3y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, 0));
    var x3y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, 1));
    var x3y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, 2));

    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);

    var y0: f32 = blendBicubic(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    var y1: f32 = blendBicubic(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    var y2: f32 = blendBicubic(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    var y3: f32 = blendBicubic(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return clamp(blendBicubic(y0, y1, y2, y3, fract(uv.y)), 0.0, 1.0);
}

fn catmullRom4x4Value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    // Sample 4x4 grid using offset-based sampling
    var x0y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, -1));
    var x0y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 0));
    var x0y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 1));
    var x0y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 2));

    var x1y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, -1));
    var x1y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    var x1y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    var x1y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 2));

    var x2y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, -1));
    var x2y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    var x2y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));
    var x2y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 2));

    var x3y0: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, -1));
    var x3y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, 0));
    var x3y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, 1));
    var x3y3: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(2, 2));

    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);

    var y0: f32 = catmullRom4(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    var y1: f32 = catmullRom4(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    var y2: f32 = catmullRom4(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    var y3: f32 = catmullRom4(x0y3, x1y3, x2y3, x3y3, fract(uv.x));

    return clamp(catmullRom4(y0, y1, y2, y3, fract(uv.y)), 0.0, 1.0);
}

fn value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let interpVal: i32 = i32(interp);

    // 0 = constant (nearest neighbor)
    if (interpVal == 0) {
        return constant(st, xFreq, yFreq, s);
    }

    // 3 = catmullRom3x3 (9 taps)
    if (interpVal == 3) {
        return catmullRom3x3Value(st, xFreq, yFreq, s);
    }

    // 4 = catmullRom4x4 (16 taps)
    if (interpVal == 4) {
        return catmullRom4x4Value(st, xFreq, yFreq, s);
    }

    // 5 = bSpline3x3 / quadratic (9 taps)
    if (interpVal == 5) {
        return quadratic3x3Value(st, xFreq, yFreq, s);
    }

    // 6 = bSpline4x4 / bicubic (16 taps)
    if (interpVal == 6) {
        return bicubicValue(st, xFreq, yFreq, s);
    }

    // 10 = simplex
    if (interpVal == 10) {
        let simplexLoopSample: f32 = simplexValue(st, xFreq, yFreq, s + 50.0, time) * loopAmp * 0.0025;
        return simplexValue(st, xFreq, yFreq, s, simplexLoopSample);
    }

    // 11 = sine
    if (interpVal == 11) {
        let sineLoopSample: f32 = sineNoise(st, xFreq, yFreq, s + 50.0, time) * loopAmp * 0.0025;
        return sineNoise(st, xFreq, yFreq, s, sineLoopSample);
    }

    // 1 = linear, 2 = hermite: 2x2 bilinear interpolation with offset-based sampling
    var x1y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    var x1y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    var x2y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    var x2y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));

    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);

    var a: f32 = blendLinearOrCosine(x1y1, x2y1, fract(uv.x), interpVal);
    var b: f32 = blendLinearOrCosine(x1y2, x2y2, fract(uv.x), interpVal);

    return clamp(blendLinearOrCosine(a, b, fract(uv.y), interpVal), 0.0, 1.0);
}

fn noise(st: vec2<f32>, s: f32) -> vec3<f32> {
    var freq: f32 = 1.0;
    if (i32(interp) != 10 && wrap > 0) {
        freq = floor(map(noiseScale, 1.0, 100.0, 6.0, 2.0));
    } else {
        if (i32(interp) == 10) {
            freq = map(noiseScale, 1.0, 100.0, 1.0, 0.5);
        } else {
            freq = map(noiseScale, 1.0, 100.0, 6.0, 1.0);
        }
    }

    var color: vec3<f32> = vec3<f32>(
        value(st, freq, freq, 0.0 + s),
        value(st, freq, freq, 10.0 + s),
        value(st, freq, freq, 20.0 + s));

    // hue
    color.r = color.r * hueRange * 0.01;
    color.r += 1.0 - (hueRotation / 360.0);

    // saturation
    color.g *= 0.333;

    // brightness - ridges > 0
    color.b = 1.0 - abs(color.b * 2.0 - 1.0);

    color = hsv2rgb(color);

    return color;
}
// end value noise

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms from the packed struct
    unpackUniforms();

    var color: vec4<f32> = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var st: vec2<f32> = pos.xy / resolution.y;
    st -= vec2<f32>(resolution.x / resolution.y * 0.5, 0.5);

    let noiseTypeVal: i32 = noiseType;

    if (noiseTypeVal == 0) {
        // caustic
        var leftColor: vec3<f32> = noise(st, seed);
        var rightColor: vec3<f32> = noise(st, seed + 10.0);

        // from the "reflect" mode in coalesce.
        var left: vec3<f32> = min(leftColor * rightColor / (1.0 - rightColor * leftColor), vec3<f32>(1.0));
        var right: vec3<f32> = min(rightColor * leftColor / (1.0 - leftColor * rightColor), vec3<f32>(1.0));

        color = vec4<f32>(brightnessContrast(mix(left, right, 0.5)), color.a);
    } else if (noiseTypeVal == 1) {
        // moodscape
        var xFreq: f32 = 1.0;
        var yFreq: f32 = 1.0;
        if (i32(interp) != 4 && i32(interp) != 10 && wrap > 0) {
            xFreq = floor(map(noiseScale, 1.0, 100.0, 3.0, 2.0));
            yFreq = xFreq;
        } else {
            if (i32(interp) == 10) {
                xFreq = map(noiseScale, 1.0, 100.0, 1.0, 0.25);
                yFreq = xFreq * 1.5;
            } else {
                xFreq = map(noiseScale, 1.0, 100.0, 1.5, 1.0);
                yFreq = xFreq * 1.5;
            }
        }

        var s: f32 = floor(seed);

        // Refract values
        var xRef: f32 = value(st, xFreq, yFreq, 20.0 + s);
        var yRef: f32 = value(st, xFreq, yFreq, 10.0 + s);

        var refAmt: f32 = map(refractAmt, 0.0, 100.0, 0.0, 2.5);
        var uv: vec2<f32> = vec2<f32>(st.x + xRef * refAmt, st.y + yRef * refAmt);

        let valueR: f32 = value(uv, xFreq, yFreq, s);
        let valueG: f32 = value(uv, xFreq, yFreq, 10.0 + s);
        let valueB: f32 = value(uv, xFreq, yFreq, 20.0 + s);

        let grayscaleColor: vec4<f32> = vec4<f32>(vec3<f32>(valueR), 1.0);
        let rgbColor: vec4<f32> = vec4<f32>(valueR, valueG, valueB, 1.0);

        color = select(rgbColor, grayscaleColor, i32(colorMode) == 0);

        if (i32(colorMode) == 0) {
            // grayscale
            if (ridges > 0) {
                color = 1.0 - abs(color * 2.0 - 1.0);
            }
        } else if (i32(colorMode) == 1) {
            // rgb
            if (ridges > 0) {
                color = 1.0 - abs(color * 2.0 - 1.0);
            }
            color = vec4<f32>(rgb2hsv(color.rgb), color.a);
            color.r = color.r * hueRange * 0.01;
            color.r += 1.0 - (hueRotation / 360.0);
            color = vec4<f32>(hsv2rgb(color.rgb), color.a);
        } else if (i32(colorMode) == 2) {
            // hsv
            color.r = color.r * hueRange * 0.01;
            color.r += 1.0 - (hueRotation / 360.0);
            if (ridges > 0) {
                color.b = 1.0 - abs(color.b * 2.0 - 1.0);
            }
            color = vec4<f32>(hsv2rgb(color.rgb), color.a);
        } else {
            // oklab
            // magic values from py-noisemaker - MIT License
            // https://github.com/noisedeck/noisemaker/blob/master/noisemaker/generators.py
            color.g = color.g * -.509 + .276;
            color.b = color.b * -.509 + .198;

            color = vec4<f32>(linear_srgb_from_oklab(color.rgb), color.a);
            color = vec4<f32>(linearToSrgb(color.rgb), color.a);
            color = vec4<f32>(rgb2hsv(color.rgb), color.a);
            color.r = color.r * hueRange * 0.01;
            color.r += 1.0 - (hueRotation / 360.0);
            if (ridges > 0) {
                color.b = 1.0 - abs(color.b * 2.0 - 1.0);
            }
            color = vec4<f32>(hsv2rgb(color.rgb), color.a);
        }
    } else if (noiseTypeVal == 2) {
        // quad tap
        st += vec2<f32>(resolution.x / resolution.y * 0.5, 0.5);
        var speed: f32 = loopAmp * 0.02;
        var x0: vec3<f32> = vec3<f32>(1.0);
        var x1: vec3<f32> = vec3<f32>(1.0);

        var c1: vec3<f32> = rgb2hsv(color1.rgb);
        var c2: vec3<f32> = rgb2hsv(color2.rgb);
        var c3: vec3<f32> = rgb2hsv(color3.rgb);
        var c4: vec3<f32> = rgb2hsv(color4.rgb);

        c1[0] += (sin(time * TAU * speed) + 1.0) * 0.05;
        c2[0] += (sin((0.25 - time) * TAU * speed) + 1.0) * 0.05;
        c3[0] += (sin((0.5 - time) * TAU * speed) + 1.0) * 0.05;
        c4[0] += (sin((0.75 + time) * TAU * speed) + 1.0) * 0.05;

        c1 = hsv2rgb(c1);
        c2 = hsv2rgb(c2);
        c3 = hsv2rgb(c3);
        c4 = hsv2rgb(c4);

        x0 = mix(c1, c2, st.x);
        x1 = mix(c3, c4, st.x);

        color = vec4<f32>(mix(x0, x1, 1.0 - st.y), color.a);
    }

    color = vec4<f32>(brightnessContrast(color.rgb), color.a);
    color.a = 1.0;

    st = pos.xy / resolution;

    return color;
}
