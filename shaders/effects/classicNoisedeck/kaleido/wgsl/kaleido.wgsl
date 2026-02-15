/*
 * Kaleidoscope shader (WGSL port).
 * Samples the input feed with mirrored wedges to generate kaleidoscopic symmetry.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    // Effect params in definition.js globals order:
    kaleido: i32,
    metric: i32,
    direction: i32,
    loopOffset: i32,
    loopScale: f32,
    loopAmp: f32,
    seed: i32,
    wrap: i32,
    kernel: i32,
    effectWidth: f32,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn aspectRatio() -> f32 {
    return u.resolution.x / u.resolution.y;
}

fn mapRange(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn periodicFunction(p: f32) -> f32 {
    return mapRange(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

// PCG PRNG
fn pcg(v_in: vec3u) -> vec3u {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p: vec3f) -> vec3f {
    return vec3f(pcg(vec3u(p))) / f32(0xffffffffu);
}

fn positiveModulo(value: i32, modulus: i32) -> i32 {
    if (modulus == 0) { return 0; }
    var r = value % modulus;
    if (r < 0) { r += modulus; }
    return r;
}

fn randomFromLatticeWithOffset(st: vec2f, freq: f32, offset: vec2i) -> vec3f {
    let lattice = st * freq;
    let baseFloor = floor(lattice);
    var base = vec2i(baseFloor) + offset;
    let frac = lattice - baseFloor;
    let seedInt = i32(floor(f32(u.seed)));
    let seedFrac = fract(f32(u.seed));
    let xCombined = frac.x + seedFrac;
    var xi = base.x + seedInt + i32(floor(xCombined));
    var yi = base.y;
    if (u.wrap != 0) {
        let freqInt = i32(freq + 0.5);
        if (freqInt > 0) {
            xi = positiveModulo(xi, freqInt);
            yi = positiveModulo(yi, freqInt);
        }
    }
    let xBits = u32(xi);
    let yBits = u32(yi);
    let seedBits = bitcast<u32>(f32(u.seed));
    let fracBits = bitcast<u32>(seedFrac);
    let jitter = vec3u(
        (fracBits * 374761393u) ^ 0x9E3779B9u,
        (fracBits * 668265263u) ^ 0x7F4A7C15u,
        (fracBits * 2246822519u) ^ 0x94D049B4u
    );
    let state = vec3u(xBits, yBits, seedBits) ^ jitter;
    let prngState = pcg(state);
    let denom = f32(0xffffffffu);
    return vec3f(f32(prngState.x) / denom, f32(prngState.y) / denom, f32(prngState.z) / denom);
}

fn constant(st: vec2f, freq: f32) -> f32 {
    let randTime = randomFromLatticeWithOffset(st, freq, vec2i(40, 0));
    let scaledTime = periodicFunction(randTime.x - u.time) * mapRange(abs(u.loopAmp), 0.0, 100.0, 0.0, 0.333);
    let rand = randomFromLatticeWithOffset(st, freq, vec2i(0, 0));
    return periodicFunction(rand.y - scaledTime);
}

fn quadratic3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    let B0 = 0.5 * (1.0 - t) * (1.0 - t);
    let B1 = 0.5 * (-2.0 * t2 + 2.0 * t + 1.0);
    let B2 = 0.5 * t2;
    return p0 * B0 + p1 * B1 + p2 * B2;
}

fn catmullRom3(p0: f32, p1: f32, p2: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    return p1 + 0.5 * t * (p2 - p0) + 0.5 * t2 * (2.0*p0 - 5.0*p1 + 4.0*p2 - p0) + 0.5 * t3 * (-p0 + 3.0*p1 - 3.0*p2 + p0);
}

fn quadratic3x3Value(st: vec2f, freq: f32) -> f32 {
    let f = fract(st * freq);
    let nd = 1.0 / freq;
    let v00 = constant(st + vec2f(-nd, -nd), freq);
    let v10 = constant(st + vec2f(0.0, -nd), freq);
    let v20 = constant(st + vec2f(nd, -nd), freq);
    let v01 = constant(st + vec2f(-nd, 0.0), freq);
    let v11 = constant(st, freq);
    let v21 = constant(st + vec2f(nd, 0.0), freq);
    let v02 = constant(st + vec2f(-nd, nd), freq);
    let v12 = constant(st + vec2f(0.0, nd), freq);
    let v22 = constant(st + vec2f(nd, nd), freq);
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    return quadratic3(y0, y1, y2, f.y);
}

fn catmullRom3x3Value(st: vec2f, freq: f32) -> f32 {
    let f = fract(st * freq);
    let nd = 1.0 / freq;
    let v00 = constant(st + vec2f(-nd, -nd), freq);
    let v10 = constant(st + vec2f(0.0, -nd), freq);
    let v20 = constant(st + vec2f(nd, -nd), freq);
    let v01 = constant(st + vec2f(-nd, 0.0), freq);
    let v11 = constant(st, freq);
    let v21 = constant(st + vec2f(nd, 0.0), freq);
    let v02 = constant(st + vec2f(-nd, nd), freq);
    let v12 = constant(st + vec2f(0.0, nd), freq);
    let v22 = constant(st + vec2f(nd, nd), freq);
    let y0 = catmullRom3(v00, v10, v20, f.x);
    let y1 = catmullRom3(v01, v11, v21, f.x);
    let y2 = catmullRom3(v02, v12, v22, f.x);
    return catmullRom3(y0, y1, y2, f.y);
}

fn blendBicubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    let B0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let B1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let B2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let B3 = t3 / 6.0;
    return p0 * B0 + p1 * B1 + p2 * B2 + p3 * B3;
}

fn catmullRom4(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}

fn blendLinearOrCosine(a: f32, b: f32, amount: f32, interp: i32) -> f32 {
    if (interp == 1) { return mix(a, b, amount); }
    return mix(a, b, smoothstep(0.0, 1.0, amount));
}

// Simplex noise
fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_2(x: vec2f) -> vec2f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute3(x: vec3f) -> vec3f { return mod289_3(((x * 34.0) + 1.0) * x); }

fn simplexValue(v: vec2f) -> f32 {
    let C = vec4f(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    var i = floor(v + dot(v, C.yy));
    let x0 = v - i + dot(i, C.xx);
    var i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
    var x12 = x0.xyxy + C.xxzz;
    x12 = vec4f(x12.xy - i1, x12.zw);
    i = mod289_2(i);
    let p = permute3(permute3(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0));
    var m = max(0.5 - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
    m = m * m;
    m = m * m;
    let x = 2.0 * fract(p * C.www) - 1.0;
    let h = abs(x) - 0.5;
    let ox = floor(x + 0.5);
    let a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    var g: vec3f;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.y = a0.y * x12.x + h.y * x12.y;
    g.z = a0.z * x12.z + h.z * x12.w;
    return 130.0 * dot(m, g);
}

fn sineNoise(st_in: vec2f, freq: f32) -> f32 {
    let st = st_in - vec2f(0.5 * aspectRatio(), 0.5);
    let rand = randomFromLatticeWithOffset(st, freq, vec2i(20, 0));
    let waveFreq = rand.x * 50.0;
    let waveAmp = rand.y;
    let wavePhase = rand.z * TAU;
    let randTime = randomFromLatticeWithOffset(st, freq, vec2i(40, 0));
    let phaseOffset = periodicFunction(randTime.x - u.time) * mapRange(abs(u.loopAmp), 0.0, 100.0, 0.0, 0.333);
    let dist = length(st);
    let sineWave = sin(dist * waveFreq + wavePhase - phaseOffset) * waveAmp;
    return periodicFunction(sineWave);
}

fn bicubicValue(st: vec2f, freq: f32) -> f32 {
    let ndX = 1.0 / freq;
    let ndY = 1.0 / freq;
    let u0 = st.x - ndX; let u1 = st.x; let u2 = st.x + ndX; let u3 = st.x + ndX + ndX;
    let v0 = st.y - ndY; let v1 = st.y; let v2 = st.y + ndY; let v3 = st.y + ndY + ndY;
    let x0y0 = constant(vec2f(u0, v0), freq); let x0y1 = constant(vec2f(u0, v1), freq);
    let x0y2 = constant(vec2f(u0, v2), freq); let x0y3 = constant(vec2f(u0, v3), freq);
    let x1y0 = constant(vec2f(u1, v0), freq); let x1y1 = constant(st, freq);
    let x1y2 = constant(vec2f(u1, v2), freq); let x1y3 = constant(vec2f(u1, v3), freq);
    let x2y0 = constant(vec2f(u2, v0), freq); let x2y1 = constant(vec2f(u2, v1), freq);
    let x2y2 = constant(vec2f(u2, v2), freq); let x2y3 = constant(vec2f(u2, v3), freq);
    let x3y0 = constant(vec2f(u3, v0), freq); let x3y1 = constant(vec2f(u3, v1), freq);
    let x3y2 = constant(vec2f(u3, v2), freq); let x3y3 = constant(vec2f(u3, v3), freq);
    let uv = st * freq;
    let y0 = blendBicubic(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    let y1 = blendBicubic(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    let y2 = blendBicubic(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    let y3 = blendBicubic(x0y3, x1y3, x2y3, x3y3, fract(uv.x));
    return blendBicubic(y0, y1, y2, y3, fract(uv.y));
}

fn catmullRom4x4Value(st: vec2f, freq: f32) -> f32 {
    let ndX = 1.0 / freq; let ndY = 1.0 / freq;
    let u0 = st.x - ndX; let u1 = st.x; let u2 = st.x + ndX; let u3 = st.x + ndX + ndX;
    let v0 = st.y - ndY; let v1 = st.y; let v2 = st.y + ndY; let v3 = st.y + ndY + ndY;
    let x0y0 = constant(vec2f(u0, v0), freq); let x0y1 = constant(vec2f(u0, v1), freq);
    let x0y2 = constant(vec2f(u0, v2), freq); let x0y3 = constant(vec2f(u0, v3), freq);
    let x1y0 = constant(vec2f(u1, v0), freq); let x1y1 = constant(st, freq);
    let x1y2 = constant(vec2f(u1, v2), freq); let x1y3 = constant(vec2f(u1, v3), freq);
    let x2y0 = constant(vec2f(u2, v0), freq); let x2y1 = constant(vec2f(u2, v1), freq);
    let x2y2 = constant(vec2f(u2, v2), freq); let x2y3 = constant(vec2f(u2, v3), freq);
    let x3y0 = constant(vec2f(u3, v0), freq); let x3y1 = constant(vec2f(u3, v1), freq);
    let x3y2 = constant(vec2f(u3, v2), freq); let x3y3 = constant(vec2f(u3, v3), freq);
    let uv = st * freq;
    let y0 = catmullRom4(x0y0, x1y0, x2y0, x3y0, fract(uv.x));
    let y1 = catmullRom4(x0y1, x1y1, x2y1, x3y1, fract(uv.x));
    let y2 = catmullRom4(x0y2, x1y2, x2y2, x3y2, fract(uv.x));
    let y3 = catmullRom4(x0y3, x1y3, x2y3, x3y3, fract(uv.x));
    return catmullRom4(y0, y1, y2, y3, fract(uv.y));
}

fn value(st_in: vec2f, freq: f32, interp: i32) -> f32 {
    let st = st_in - vec2f(0.5 * aspectRatio(), 0.5);
    if (interp == 3) { return catmullRom3x3Value(st, freq); }
    else if (interp == 4) { return catmullRom4x4Value(st, freq); }
    else if (interp == 5) { return quadratic3x3Value(st, freq); }
    else if (interp == 6) { return bicubicValue(st, freq); }
    else if (interp == 10) { return periodicFunction(simplexValue(st * freq + vec2f(f32(u.seed)))); }
    else if (interp == 11) { return sineNoise(st, freq); }
    let x1y1 = constant(st, freq);
    if (interp == 0) { return x1y1; }
    let ndX = 1.0 / freq; let ndY = 1.0 / freq;
    let x1y2 = constant(vec2f(st.x, st.y + ndY), freq);
    let x2y1 = constant(vec2f(st.x + ndX, st.y), freq);
    let x2y2 = constant(vec2f(st.x + ndX, st.y + ndY), freq);
    let uv = st * freq;
    let a = blendLinearOrCosine(x1y1, x2y1, fract(uv.x), interp);
    let b = blendLinearOrCosine(x1y2, x2y2, fract(uv.x), interp);
    return blendLinearOrCosine(a, b, fract(uv.y), interp);
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
    let h = fract(hsv.x); let s = hsv.y; let v = hsv.z;
    let c = v * s; let x = c * (1.0 - abs(fract(h * 6.0) * 2.0 - 1.0)); let m = v - c;
    var rgb: vec3f;
    if (h < 1.0/6.0) { rgb = vec3f(c, x, 0.0); }
    else if (h < 2.0/6.0) { rgb = vec3f(x, c, 0.0); }
    else if (h < 3.0/6.0) { rgb = vec3f(0.0, c, x); }
    else if (h < 4.0/6.0) { rgb = vec3f(0.0, x, c); }
    else if (h < 5.0/6.0) { rgb = vec3f(x, 0.0, c); }
    else { rgb = vec3f(c, 0.0, x); }
    return rgb + vec3f(m);
}

fn rgb2hsv(rgb: vec3f) -> vec3f {
    let maxC = max(rgb.r, max(rgb.g, rgb.b));
    let minC = min(rgb.r, min(rgb.g, rgb.b));
    let delta = maxC - minC;
    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == rgb.r) { h = ((rgb.g - rgb.b) / delta) % 6.0 / 6.0; }
        else if (maxC == rgb.g) { h = ((rgb.b - rgb.r) / delta + 2.0) / 6.0; }
        else { h = ((rgb.r - rgb.g) / delta + 4.0) / 6.0; }
    }
    let s = select(0.0, delta / maxC, maxC != 0.0);
    return vec3f(h, s, maxC);
}

fn convolve(uv: vec2f, kernel: array<f32, 9>, divide: bool) -> vec3f {
    let steps = 1.0 / u.resolution;
    let offsets = array<vec2f, 9>(
        vec2f(-steps.x, -steps.y), vec2f(0.0, -steps.y), vec2f(steps.x, -steps.y),
        vec2f(-steps.x, 0.0), vec2f(0.0, 0.0), vec2f(steps.x, 0.0),
        vec2f(-steps.x, steps.y), vec2f(0.0, steps.y), vec2f(steps.x, steps.y)
    );
    var kernelWeight = 0.0; var conv = vec3f(0.0);
    for (var i = 0; i < 9; i++) {
        let color = textureSample(inputTex, samp, uv + offsets[i] * u.effectWidth).rgb;
        conv += color * kernel[i]; kernelWeight += kernel[i];
    }
    if (divide && kernelWeight != 0.0) { conv /= kernelWeight; }
    return clamp(conv, vec3f(0.0), vec3f(1.0));
}

fn desaturate(color: vec3f) -> vec3f {
    return vec3f(0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b);
}

fn derivatives(color: vec3f, uv: vec2f, divide: bool) -> vec3f {
    let deriv_x = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
    let deriv_y = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0);
    return color * distance(convolve(uv, deriv_x, divide), convolve(uv, deriv_y, divide));
}

fn sobel(color: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    return color * distance(convolve(uv, sobel_x, false), convolve(uv, sobel_y, false));
}

fn outline(color: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    return max(color - distance(convolve(uv, sobel_x, false), convolve(uv, sobel_y, false)), vec3f(0.0));
}

fn shadow(color_in: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    var color = rgb2hsv(color_in);
    let shade_dist = distance(convolve(uv, sobel_x, false), convolve(uv, sobel_y, false));
    let highlight = shade_dist * shade_dist;
    let shade = (1.0 - ((1.0 - color.z) * (1.0 - highlight))) * shade_dist;
    color = vec3f(color.x, color.y, mix(color.z, shade, 0.75));
    return hsv2rgb(color);
}

fn convolution(kernel: i32, color: vec3f, uv: vec2f) -> vec3f {
    let emboss = array<f32, 9>(-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0);
    let sharpen = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 5.0, 0.0, -1.0, 0.0, -1.0);
    let blur = array<f32, 9>(1.0, 2.0, 1.0, 2.0, 4.0, 2.0, 1.0, 2.0, 1.0);
    let edge2 = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 4.0, 0.0, -1.0, 0.0, -1.0);
    if (kernel == 0) { return color; }
    else if (kernel == 1) { return convolve(uv, blur, true); }
    else if (kernel == 2) { return derivatives(color, uv, true); }
    else if (kernel == 120) { return clamp(derivatives(color, uv, false) * 2.5, vec3f(0.0), vec3f(1.0)); }
    else if (kernel == 3) { return color * convolve(uv, edge2, true); }
    else if (kernel == 4) { return convolve(uv, emboss, false); }
    else if (kernel == 5) { return outline(color, uv); }
    else if (kernel == 6) { return shadow(color, uv); }
    else if (kernel == 7) { return convolve(uv, sharpen, false); }
    else if (kernel == 8) { return sobel(color, uv); }
    return color;
}

fn shape(st_in: vec2f, sides: i32, blend: f32) -> f32 {
    if (sides < 2) { return distance(st_in, vec2f(0.5)); }
    let st = vec2f(st_in.x, 1.0 - st_in.y) * 2.0 - vec2f(aspectRatio(), 1.0);
    let a = atan2(st.x, st.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st) * blend;
}

fn posterize(color: vec3f, levIn: f32) -> vec3f {
    var lev = levIn;
    if (lev == 0.0) { return color; }
    else if (lev == 1.0) { lev = 2.0; }
    let c = clamp(color, vec3f(0.0), vec3f(0.99));
    return (floor(c * lev) + 0.5) / lev;
}

fn pixellate(uv: vec2f, size: f32) -> vec3f {
    let dx = size / u.resolution.x;
    let dy = size / u.resolution.y;
    return textureSample(inputTex, samp, vec2f(dx * floor(uv.x / dx), dy * floor(uv.y / dy))).rgb;
}

fn circles(st: vec2f, freq: f32) -> f32 {
    return length(st - vec2f(0.5 * aspectRatio(), 0.5)) * freq;
}

fn rings(st: vec2f, freq: f32) -> f32 {
    return cos(length(st - vec2f(0.5 * aspectRatio(), 0.5)) * PI * freq);
}

fn diamonds(st: vec2f, freq: f32) -> f32 {
    var s = st; s.x -= 0.5 * aspectRatio(); s *= freq;
    return sin(s.x * PI) + sin(s.y * PI);
}

fn getMetric(st: vec2f) -> f32 {
    let diff = vec2f(0.5 * aspectRatio(), 0.5) - st;
    if (u.metric == 0) { return length(st - vec2f(0.5 * aspectRatio(), 0.5)); }
    else if (u.metric == 1) { return abs(diff.x) + abs(diff.y); }
    else if (u.metric == 2) { return max(max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y), max(abs(diff.x) - diff.y * 0.5, 1.0 * diff.y)); }
    else if (u.metric == 3) { return max((abs(diff.x) + abs(diff.y)) / sqrt(2.0), max(abs(diff.x), abs(diff.y))); }
    else if (u.metric == 4) { return max(abs(diff.x), abs(diff.y)); }
    else if (u.metric == 5) { return max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y); }
    return 1.0;
}

fn offset(st: vec2f, freq: f32) -> f32 {
    if (u.loopOffset == 10) { return circles(st, freq); }
    else if (u.loopOffset == 20) { return shape(st, 3, freq * 0.5); }
    else if (u.loopOffset == 30) { return (abs(st.x - 0.5 * aspectRatio()) + abs(st.y - 0.5)) * freq * 0.5; }
    else if (u.loopOffset == 40) { return shape(st, 4, freq * 0.5); }
    else if (u.loopOffset == 50) { return shape(st, 5, freq * 0.5); }
    else if (u.loopOffset == 60) { return shape(st, 6, freq * 0.5); }
    else if (u.loopOffset == 70) { return shape(st, 7, freq * 0.5); }
    else if (u.loopOffset == 80) { return shape(st, 8, freq * 0.5); }
    else if (u.loopOffset == 90) { return shape(st, 9, freq * 0.5); }
    else if (u.loopOffset == 100) { return shape(st, 10, freq * 0.5); }
    else if (u.loopOffset == 110) { return shape(st, 11, freq * 0.5); }
    else if (u.loopOffset == 120) { return shape(st, 12, freq * 0.5); }
    else if (u.loopOffset == 200) { return st.x * freq * 0.5; }
    else if (u.loopOffset == 210) { return st.y * freq * 0.5; }
    else if (u.loopOffset == 300) { return 1.0 - value(st, freq, 0); }
    else if (u.loopOffset == 310) { return 1.0 - value(st, freq, 1); }
    else if (u.loopOffset == 320) { return 1.0 - value(st, freq, 2); }
    else if (u.loopOffset == 330) { return 1.0 - value(st, freq, 3); }
    else if (u.loopOffset == 340) { return 1.0 - value(st, freq, 4); }
    else if (u.loopOffset == 350) { return 1.0 - value(st, freq, 5); }
    else if (u.loopOffset == 360) { return 1.0 - value(st, freq, 6); }
    else if (u.loopOffset == 370) { return 1.0 - value(st, freq, 10); }
    else if (u.loopOffset == 380) { return 1.0 - value(st, freq, 11); }
    else if (u.loopOffset == 400) { return 1.0 - rings(st, freq); }
    else if (u.loopOffset == 410) { return 1.0 - diamonds(st, freq); }
    return 0.0;
}

fn kaleidoscope(st_in: vec2f, sides: f32, blendy: f32) -> vec2f {
    let r = getMetric(st_in) + blendy;
    var st = st_in - vec2f(0.5 * aspectRatio(), 0.5);
    var a = atan2(st.y, st.x);
    var dir = u.time;
    if (u.direction == 1) { dir *= -1.0; }
    else if (u.direction == 2) { dir = 1.0; }
    var ma = (a + radians(90.0) - radians(360.0 / sides * dir)) % (TAU / sides);
    ma = abs(ma - PI / sides);
    st = r * vec2f(cos(ma), sin(ma));
    return fract(st);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var uv = fragCoord.xy / u.resolution.y;

    var lf = mapRange(u.loopScale, 1.0, 100.0, 6.0, 1.0);
    if (u.wrap != 0) { lf = floor(lf); }

    let t = u.time + offset(uv, lf) * u.loopAmp * 0.01;
    let blendy = periodicFunction(t) * mapRange(abs(u.loopAmp), 0.0, 100.0, 0.0, 2.0);

    uv = kaleidoscope(uv, f32(u.kaleido), blendy);
    var color = textureSample(inputTex, samp, uv);

    if (u.effectWidth != 0.0 && u.kernel != 0) {
        if (u.kernel == 10) { color = vec4f(pixellate(uv, u.effectWidth * 4.0), color.a); }
        else if (u.kernel == 110) { color = vec4f(posterize(color.rgb, floor(mapRange(u.effectWidth, 0.0, 10.0, 0.0, 20.0))), color.a); }
        else { color = vec4f(convolution(u.kernel, color.rgb, uv), color.a); }
    }

    return color;
}
