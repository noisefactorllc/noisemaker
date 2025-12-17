/*
 * WGSL Moodscape shader.
 * Refracted value noise with multiple color modes.
 */

// Packed uniforms layout:
//   data[0]: resolution.xy, time, seed
//   data[1]: interp, noiseScale, loopAmp, refractAmt
//   data[2]: ridges, wrap, colorMode, hueRotation
//   data[3]: hueRange, intensity, _pad, _pad
struct Uniforms {
    data: array<vec4<f32>, 4>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

var<private> resolution: vec2<f32>;
var<private> time: f32;
var<private> seed: f32;
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

fn unpackUniforms() {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    seed = uniforms.data[0].w;
    interp = i32(uniforms.data[1].x);
    noiseScale = uniforms.data[1].y;
    loopAmp = uniforms.data[1].z;
    refractAmt = uniforms.data[1].w;
    ridges = i32(uniforms.data[2].x);
    wrap = i32(uniforms.data[2].y);
    colorMode = i32(uniforms.data[2].z);
    hueRotation = uniforms.data[2].w;
    hueRange = uniforms.data[3].x;
    intensity = uniforms.data[3].y;
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG
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
    
    var c: f32 = v * s;
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

// oklab
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

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    var lms: vec3<f32> = fwdA * c;
    return fwdB * (lms * lms * lms);
}

fn periodicFunction(p: f32) -> f32 {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

// Simplex 2D
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
    const C: vec4<f32> = vec4<f32>(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);

    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);
    uv.x += s;

    var i: vec2<f32> = floor(uv + dot(uv, C.yy) );
    var x0: vec2<f32> = uv -   i + dot(i, C.xx);

    var i1: vec2<f32>;
    i1 = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), x0.x > x0.y);
    let x1: vec2<f32> = x0 - i1 + vec2<f32>(C.x, C.x);
    let x2: vec2<f32> = x0 - vec2<f32>(1.0, 1.0) + vec2<f32>(2.0 * C.x, 2.0 * C.x);
    let x12xz = vec2<f32>(x1.x, x2.x);
    let x12yw = vec2<f32>(x1.y, x2.y);

    i = mod289_2(i);
    var p: vec3<f32> = permute( permute( i.y + vec3<f32>(0.0, i1.y, 1.0 ))
		  + i.x + vec3<f32>(0.0, i1.x, 1.0 ));

    var m: vec3<f32> = max(vec3<f32>(0.5) - vec3<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2)), vec3<f32>(0.0));
    m = m*m;
    m = m*m;

    var x: vec3<f32> = 2.0 * fract(p * C.www) - 1.0;
    var h: vec3<f32> = abs(x) - 0.5;
    var ox: vec3<f32> = floor(x + 0.5);
    var a0: vec3<f32> = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    var g: vec3<f32>;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    let gyz = a0.yz * x12xz + h.yz * x12yw;
    g.y = gyz.x;
    g.z = gyz.y;

    var v: f32 = 130.0 * dot(m, g);

    return periodicFunction(map(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

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

// Value noise
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

fn quadratic3x3Value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let lattice = vec2<f32>(st.x * xFreq, st.y * yFreq);
    let f = fract(lattice);
    
    let v00 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, -1));
    let v10 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, -1));
    let v20 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, -1));
    
    let v01 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 0));
    let v11 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    let v21 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    
    let v02 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(-1, 1));
    let v12 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    let v22 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));
    
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    
    return quadratic3(y0, y1, y2, f.y);
}

fn catmullRom3x3Value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let lattice = vec2<f32>(st.x * xFreq, st.y * yFreq);
    let f = fract(lattice);
    
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

fn bicubicValue(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
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

    if (interpVal == 0) {
        return constant(st, xFreq, yFreq, s);
    }

    if (interpVal == 3) {
        return catmullRom3x3Value(st, xFreq, yFreq, s);
    }

    if (interpVal == 4) {
        return catmullRom4x4Value(st, xFreq, yFreq, s);
    }

    if (interpVal == 5) {
        return quadratic3x3Value(st, xFreq, yFreq, s);
    }

    if (interpVal == 6) {
        return bicubicValue(st, xFreq, yFreq, s);
    }

    if (interpVal == 10) {
        let simplexLoopSample: f32 = simplexValue(st, xFreq, yFreq, s + 50.0, time) * loopAmp * 0.0025;
        return simplexValue(st, xFreq, yFreq, s, simplexLoopSample);
    }

    if (interpVal == 11) {
        let sineLoopSample: f32 = sineNoise(st, xFreq, yFreq, s + 50.0, time) * loopAmp * 0.0025;
        return sineNoise(st, xFreq, yFreq, s, sineLoopSample);
    }

    // 1 = linear, 2 = hermite
    var x1y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 0));
    var x1y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(0, 1));
    var x2y1: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 0));
    var x2y2: f32 = constantOffset(st, xFreq, yFreq, s, vec2<i32>(1, 1));

    var uv: vec2<f32> = vec2<f32>(st.x * xFreq, st.y * yFreq);

    var a: f32 = blendLinearOrCosine(x1y1, x2y1, fract(uv.x), interpVal);
    var b: f32 = blendLinearOrCosine(x1y2, x2y2, fract(uv.x), interpVal);

    return clamp(blendLinearOrCosine(a, b, fract(uv.y), interpVal), 0.0, 1.0);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    unpackUniforms();

    var color: vec4<f32> = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var st: vec2<f32> = pos.xy / resolution.y;
    st -= vec2<f32>(resolution.x / resolution.y * 0.5, 0.5);

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
        color.r += 1.0 - (hueRotation / 360.0);
        color.r = fract(color.r);
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
        color.g = color.g * -.509 + .276;
        color.b = color.b * -.509 + .198;

        color = vec4<f32>(linear_srgb_from_oklab(color.rgb), color.a);
        color = vec4<f32>(linearToSrgb(color.rgb), color.a);
        color = vec4<f32>(rgb2hsv(color.rgb), color.a);
        color.r += 1.0 - (hueRotation / 360.0);
        color.r = fract(color.r);
        if (ridges > 0) {
            color.b = 1.0 - abs(color.b * 2.0 - 1.0);
        }
        color = vec4<f32>(hsv2rgb(color.rgb), color.a);
    }

    color = vec4<f32>(brightnessContrast(color.rgb), color.a);
    color.a = 1.0;

    return color;
}
