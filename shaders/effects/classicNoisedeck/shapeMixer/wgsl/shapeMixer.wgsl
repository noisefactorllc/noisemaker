/*
 * Shape mixer shader (WGSL port).
 * Combines procedural shapes and mixes them with the input feed under configurable blend modes.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,            
    deltaTime: f32,       
    frame: i32,           
    _pad0: f32,           // pad before resolution (vec2 needs 8-byte align)
    resolution: vec2f,    
    aspect: f32,          
    blendMode: i32,       
    loopOffset: i32,      
    loopScale: f32,       
    animate: i32,         
    palette: i32,         
    paletteMode: i32,     
    _pad1a: f32,          // 3 f32s to pad from offset 52 to 64 for vec3
    _pad1b: f32,          
    _pad1c: f32,          
    paletteOffset: vec3f, 
    _pad2: f32,           
    paletteAmp: vec3f,    
    _pad3: f32,           
    paletteFreq: vec3f,   
    _pad4: f32,           
    palettePhase: vec3f,  
    cyclePalette: i32,    
    rotatePalette: f32,   
    repeatPalette: i32,   
    levels: i32,          
    wrap: i32,            
    seed: i32,            
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

fn hsv2rgb(hsv: vec3f) -> vec3f {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    let c = v * s;
    let x = c * (1.0 - abs(fract(h * 6.0) * 2.0 - 1.0));
    let m = v - c;
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

fn linearToSrgb(linear: vec3f) -> vec3f {
    var srgb: vec3f;
    srgb.x = select(1.055 * pow(linear.x, 1.0/2.4) - 0.055, linear.x * 12.92, linear.x <= 0.0031308);
    srgb.y = select(1.055 * pow(linear.y, 1.0/2.4) - 0.055, linear.y * 12.92, linear.y <= 0.0031308);
    srgb.z = select(1.055 * pow(linear.z, 1.0/2.4) - 0.055, linear.z * 12.92, linear.z <= 0.0031308);
    return srgb;
}

const fwdA: mat3x3f = mat3x3f(
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.3963377774, -0.1055613458, -0.0894841775),
    vec3f(0.2158037573, -0.0638541728, -1.2914855480)
);
const fwdB: mat3x3f = mat3x3f(
    vec3f(4.0767245293, -1.2681437731, -0.0041119885),
    vec3f(-3.3072168827, 2.6093323231, -0.7034763098),
    vec3f(0.2307590544, -0.3411344290, 1.7068625689)
);
const invB: mat3x3f = mat3x3f(
    vec3f(0.4121656120, 0.2118591070, 0.0883097947),
    vec3f(0.5362752080, 0.6807189584, 0.2818474174),
    vec3f(0.0514575653, 0.1074065790, 0.6302613616)
);
const invA: mat3x3f = mat3x3f(
    vec3f(0.2104542553, 1.9779984951, 0.0259040371),
    vec3f(0.7936177850, -2.4285922050, 0.7827717662),
    vec3f(-0.0040720468, 0.4505937099, -0.8086757660)
);

fn oklab_from_linear_srgb(c: vec3f) -> vec3f {
    let lms = invB * c;
    return invA * (sign(lms) * pow(abs(lms), vec3f(0.333333)));
}

fn linear_srgb_from_oklab(c: vec3f) -> vec3f {
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

fn pal(t_in: f32) -> vec3f {
    var t = t_in * f32(u.repeatPalette) + u.rotatePalette * 0.01;
    var color = u.paletteOffset + u.paletteAmp * cos(TAU * (u.paletteFreq * t + u.palettePhase));
    if (u.paletteMode == 1) { color = hsv2rgb(color); }
    else if (u.paletteMode == 2) {
        color.g = color.g * -0.509 + 0.276;
        color.b = color.b * -0.509 + 0.198;
        color = linear_srgb_from_oklab(color);
        color = linearToSrgb(color);
    }
    return color;
}

fn luminance(color: vec3f) -> f32 {
    return rgb2hsv(color).b;
}

fn posterize(d_in: f32, levIn: f32) -> f32 {
    var lev = levIn;
    if (lev == 0.0) { return d_in; }
    else if (lev == 1.0) { lev = 2.0; }
    let d = clamp(d_in, 0.0, 0.99);
    return (floor(d * lev) + 0.5) / lev;
}

fn posterize2(d: f32, levIn: f32) -> f32 {
    if (levIn == 0.0) { return d; }
    let lev = levIn + 0.1;
    return floor(d * lev) / lev;
}

fn posterize2_vec3(c: vec3f, lev: f32) -> vec3f {
    return vec3f(posterize2(c.r, lev), posterize2(c.g, lev), posterize2(c.b, lev));
}

// Shapes
fn rings(st: vec2f, freq: f32) -> f32 {
    let dist = length(st - vec2f(0.5 * aspectRatio(), 0.5));
    return cos(dist * PI * freq);
}

fn circles(st: vec2f, freq: f32) -> f32 {
    let dist = length(st - vec2f(0.5 * aspectRatio(), 0.5));
    return dist * freq;
}

fn diamonds(st_in: vec2f, freq: f32) -> f32 {
    var st = st_in;
    st -= vec2f(0.5 * aspectRatio(), 0.5);
    st *= freq;
    return cos(st.x * PI) + cos(st.y * PI);
}

fn shape(st_in: vec2f, sides: i32, blend: f32) -> f32 {
    let st = st_in * 2.0 - vec2f(aspectRatio(), 1.0);
    let a = atan2(st.x, st.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st) * blend;
}

// Noise functions
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
    var scaledTime = 1.0;
    if (u.animate == -1) { scaledTime = periodicFunction(randTime.x - u.time); }
    else if (u.animate == 1) { scaledTime = periodicFunction(randTime.x + u.time); }
    let rand = randomFromLatticeWithOffset(st, freq, vec2i(0, 0));
    return periodicFunction(rand.x - scaledTime);
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

fn bicubicValue(st: vec2f, freq: f32) -> f32 {
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

// Simplex noise
fn mod289_3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_2(x: vec2f) -> vec2f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute3(x: vec3f) -> vec3f { return mod289_3(((x * 34.0) + 1.0) * x); }

fn simplexValue(st_in: vec2f, freq: f32, s: f32, blend: f32) -> f32 {
    let C = vec4f(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    var uv = st_in * freq;
    uv.x += s;
    var i = floor(uv + dot(uv, C.yy));
    let x0 = uv - i + dot(i, C.xx);
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
    let v = 130.0 * dot(m, g);
    return periodicFunction(mapRange(v, -1.0, 1.0, 0.0, 1.0) - blend);
}

fn sineNoise(st_in: vec2f, freq: f32) -> f32 {
    var st = st_in;
    st -= vec2f(aspectRatio() * 0.5, 0.5);
    st *= freq;
    st += vec2f(aspectRatio() * 0.5, 0.5);
    let r1 = prng(vec3f(f32(u.seed)));
    let r2 = prng(vec3f(f32(u.seed) + 10.0));
    let scaleA = r1.x * TAU;
    let scaleC = r1.y * TAU;
    let scaleB = r1.z * TAU;
    let scaleD = r2.x * TAU;
    let offA = r2.y * TAU;
    let offB = r2.z * TAU;
    return sin(scaleA * st.x + sin(scaleB * st.y + offA)) + sin(scaleC * st.y + sin(scaleD * st.x + offB)) * 0.5 + 0.5;
}

fn value(st: vec2f, freq: f32, interp: i32) -> f32 {
    if (interp == 3) { return catmullRom3x3Value(st, freq); }
    else if (interp == 4) { return catmullRom4x4Value(st, freq); }
    else if (interp == 5) { return quadratic3x3Value(st, freq); }
    else if (interp == 6) { return bicubicValue(st, freq); }
    else if (interp == 10) {
        var scaledTime = 1.0;
        if (u.animate == -1) { scaledTime = simplexValue(st, freq, f32(u.seed) + 40.0, u.time); }
        else if (u.animate == 1) { scaledTime = simplexValue(st, freq, f32(u.seed) + 40.0, -u.time); }
        return simplexValue(st, freq, f32(u.seed), scaledTime);
    }
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

fn offset(st_in: vec2f, freq: f32) -> f32 {
    var st = st_in;
    st.x *= aspectRatio();
    st.y = 1.0 - st.y;
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
    else if (u.loopOffset == 380) { return 1.0 - sineNoise(st, freq); }
    else if (u.loopOffset == 400) { return 1.0 - rings(st, freq); }
    else if (u.loopOffset == 410) { return 1.0 - diamonds(st, freq) * 0.5 + 0.5; }
    return 0.0;
}

fn blendFloat(color1: f32, color2: f32, mode: i32, factorIn: f32) -> f32 {
    let factor = 1.0 - factorIn;
    if (mode == 0) { return color1 + color2 * factor; }
    else if (mode == 1) { let c2 = max(0.1, color2 * factor); return color1 / c2; }
    else if (mode == 2) { return max(color1, color2 * factor); }
    else if (mode == 3) { return min(color1, color2 * factor); }
    else if (mode == 4) { return mix(color1, color2, clamp(factor, 0.0, 1.0)); }
    else if (mode == 5) { let c2 = max(0.1, color2 * factor); return color1 % c2; }
    else if (mode == 6) { return color1 * color2 * factor; }
    else if (mode == 7) {
        // reflect for scalar: r = i - 2*dot(n,i)*n = i - 2*n*i*n = i*(1 - 2*n^2)
        let n = color2 * factor;
        return color1 - 2.0 * n * color1 * n;
    }
    else if (mode == 8) {
        // refract for scalar approximation
        let eta = factor;
        let cosi = color1;
        let k = 1.0 - eta * eta * (1.0 - cosi * cosi);
        if (k < 0.0) { return 0.0; }
        return eta * color1 + (eta * cosi - sqrt(k)) * color2;
    }
    else if (mode == 9) { return color1 - color2 * factor; }
    return mix(color1, color2, clamp(factor, 0.0, 1.0));
}

fn blendVec3(color1: vec3f, color2: vec3f, mode: i32, factorIn: f32) -> vec3f {
    let factor = 1.0 - factorIn;
    if (mode == 0) { return color1 + color2 * factor; }
    else if (mode == 1) { return color1 / (color2 * factor); }
    else if (mode == 2) { return max(color1, color2 * factor); }
    else if (mode == 3) { return min(color1, color2 * factor); }
    else if (mode == 4) { return mix(color1, color2, clamp(factor, 0.0, 1.0)); }
    else if (mode == 5) { return color1 % (color2 * factor); }
    else if (mode == 6) { return color1 * color2 * factor; }
    else if (mode == 7) { return reflect(color1, color2 * factor); }
    else if (mode == 8) { return refract(color1, color2, factor); }
    else if (mode == 9) { return color1 - color2 * factor; }
    return mix(color1, color2, clamp(factor, 0.0, 1.0));
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var st = fragCoord.xy / u.resolution;
    st.y = 1.0 - st.y;

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);

    var freq = 1.0;
    if (u.loopOffset == 350) {
        freq = mapRange(u.loopScale, 1.0, 100.0, 12.0, 0.5);
    } else {
        freq = mapRange(u.loopScale, 1.0, 100.0, 10.0, 2.0);
    }
    if (u.loopOffset >= 300 && u.loopOffset < 340 && u.wrap != 0) {
        freq = floor(freq) * 2.0;
    }

    var t = 1.0;
    if (u.animate == -1) { t = u.time + offset(st, freq); }
    else if (u.animate == 1) { t = u.time - offset(st, freq); }
    else { t = offset(st, freq); }
    var blendy = periodicFunction(t);

    if (u.loopOffset == 0) { blendy = 0.5; }

    let avg1 = luminance(color1.rgb);
    let avg2 = luminance(color2.rgb);
    let avgMix = blendFloat(avg1, avg2, u.blendMode, blendy);
    let d = posterize(avgMix, f32(u.levels));

    var color: vec4f;

    if (u.paletteMode == 4) {
        var c = blendVec3(color1.rgb, color2.rgb, u.blendMode, blendy * 0.5);
        c = rgb2hsv(c);
        var hue = c.r + u.rotatePalette * 0.01;
        if (u.cyclePalette == -1) { hue = (hue + u.time) % 1.0; }
        else if (u.cyclePalette == 1) { hue = (hue - u.time) % 1.0; }
        c = hsv2rgb(vec3f(hue, c.g, c.b));
        c = posterize2_vec3(c, f32(u.levels));
        color = vec4f(c, max(color1.a, color2.a));
    } else {
        var palD = d;
        if (u.cyclePalette == -1) { palD = d + u.time; }
        else if (u.cyclePalette == 1) { palD = d - u.time; }
        color = vec4f(pal(palD), max(color1.a, color2.a));
    }

    return color;
}
