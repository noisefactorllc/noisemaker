/*
 * WGSL variant of the bit-effects post processor.
 * Implements 8-bit arithmetic and logical operators through masked integer math so the visuals match the GLSL reference exactly.
 * PCG-driven jitter and rotation mapping keep scanline permutations deterministic when speed modulates the timeline.
 */

struct Uniforms {
    data : array<vec4<f32>, 5>
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;

var<private> time : f32;
var<private> seed : f32;
var<private> resolution : vec2<f32>;
var<private> formula : i32;
var<private> colorScheme : i32;
var<private> n : f32;
var<private> interp : i32;
var<private> scale : f32;
var<private> rotation : f32;
var<private> speed : f32;
var<private> mode : i32;
var<private> maskFormula : i32;
var<private> tiles : f32;
var<private> complexity : f32;
var<private> maskColorScheme : i32;
var<private> hueRange : f32;
var<private> hueRotation : f32;
var<private> baseHueRange : f32;

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;

    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;

    v.x = v.x ^ (v.x >> 16u);
    v.y = v.y ^ (v.y >> 16u);
    v.z = v.z ^ (v.z >> 16u);

    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;

    return v;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(pcg(vec3<u32>(p))) / f32(0xffffffffu);
}

fn rotate2D(st: vec2<f32>, rot: f32) -> vec2<f32> {
    var st2 = st;
    let angle = map(rot, 0.0, 360.0, 0.0, 1.0) * TAU;
    st2 = st2 - resolution * 0.5;
    let c = cos(angle);
    let s = sin(angle);
    let m = mat2x2<f32>(c, -s, s, c);
    st2 = m * st2;
    st2 = st2 + resolution * 0.5;
    return st2;
}

fn periodicFunction(p: f32) -> f32 {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

fn constant(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    var x = st.x * xFreq;
    var y = st.y * yFreq;

    x = x + s;

    let scaledTime = periodicFunction(
            prng(vec3<f32>(floor(vec2<f32>(x + 40.0, y)), 0.0)).x - time
        ) * map(abs(speed), 0.0, 100.0, 0.0, 0.333);

    return periodicFunction(prng(vec3<f32>(floor(vec2<f32>(x, y)), 0.0)).x - scaledTime);
}

fn value(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    let x1y1 = constant(st, xFreq, yFreq, s);

    if (interp == 0) {
        return x1y1;
    }

    let ndX = 1.0 / xFreq;
    let ndY = 1.0 / yFreq;

    let x1y2 = constant(vec2<f32>(st.x, st.y + ndY), xFreq, yFreq, s);
    let x2y1 = constant(vec2<f32>(st.x + ndX, st.y), xFreq, yFreq, s);
    let x2y2 = constant(vec2<f32>(st.x + ndX, st.y + ndY), xFreq, yFreq, s);

    let uv = vec2<f32>(st.x * xFreq, st.y * yFreq);

    let a = mix(x1y1, x2y1, fract(uv.x));
    let b = mix(x1y2, x2y2, fract(uv.x));

    return mix(a, b, fract(uv.y));
}

const BIT_COUNT : u32 = 8u;
const mask : i32 = i32((1u << BIT_COUNT) - 1u);

fn modi(x: i32, y: i32) -> i32 {
    return (x % y) & mask;
}

fn or_i(a: i32, b: i32) -> i32 {
    return (a & mask) | (b & mask);
}

fn and_i(a: i32, b: i32) -> i32 {
    return (a & mask) & (b & mask);
}

fn not_i(a: i32) -> i32 {
    return (~a) & mask;
}

fn xor_i(a: i32, b: i32) -> i32 {
    return (a & mask) ^ (b & mask);
}

fn or_f(a: f32, b: f32) -> f32 {
    return f32(or_i(i32(a), i32(b)));
}

fn and_f(a: f32, b: f32) -> f32 {
    return f32(and_i(i32(a), i32(b)));
}

fn not_f(a: f32) -> f32 {
    return f32(not_i(i32(a)));
}

fn xor_f(a: f32, b: f32) -> f32 {
    return f32(xor_i(i32(a), i32(b)));
}

fn mod_f(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn bitValue(st: vec2<f32>, freq: f32, nForColor: f32) -> f32 {
    let blendy = nForColor + periodicFunction(value(st, freq * 0.01, freq * 0.01, nForColor) * 0.1) * 100.0;

    var v = 1.0;

    if (formula == 0) {
        v = mod_f(xor_f(st.x * freq, st.y * freq), blendy);
    } else if (formula == 1) {
        v = mod_f(or_f(st.x * freq, st.y * freq), blendy);
    } else if (formula == 2) {
        v = mod_f((st.x * freq) * (st.y * freq), blendy);
    } else if (formula == 3) {
        v = f32(xor_f(st.x * freq, st.y * freq) < blendy);
    } else if (formula == 4) {
        v = mod_f(st.x * freq * blendy, st.y * freq);
    } else if (formula == 5) {
        v = mod_f(((st.x * freq - 0.5) * 0.25), st.y * freq - 0.5);
    }

    return select(1.0, 0.0, v > 1.0);
}

fn bitField(st: vec2<f32>) -> vec3<f32> {
    var st2 = st / scale;
    st2 = rotate2D(st2, rotation);

    let freq = map(scale, 1.0, 100.0, scale, 8.0);

    var color = vec3<f32>(0.0);

    if (colorScheme == 0) {
        color.z = bitValue(st2, freq, n);
    } else if (colorScheme == 1) {
        let v1 = bitValue(st2, freq, n);
        color.y = v1;
        color.z = v1;
    } else if (colorScheme == 2) {
        color.y = bitValue(st2, freq, n);
    } else if (colorScheme == 3) {
        let v2 = bitValue(st2, freq, n);
        color.x = v2;
        color.z = v2;
    } else if (colorScheme == 4) {
        color.x = bitValue(st2, freq, n);
    } else if (colorScheme == 5) {
        color = vec3<f32>(bitValue(st2, freq, n));
    } else if (colorScheme == 6) {
        let v3 = bitValue(st2, freq, n);
        color.x = v3;
        color.y = v3;
    } else if (colorScheme == 10) {
        color.z = bitValue(st2, freq, n);
        color.y = bitValue(st2, freq, n + 1.0);
    } else if (colorScheme == 11) {
        color.z = bitValue(st2, freq, n);
        color.x = bitValue(st2, freq, n + 1.0);
    } else if (colorScheme == 12) {
        color.z = bitValue(st2, freq, n);
        let v4 = bitValue(st2, freq, n + 1.0);
        color.x = v4;
        color.y = v4;
    } else if (colorScheme == 13) {
        color.y = bitValue(st2, freq, n);
        let v5 = bitValue(st2, freq, n + 1.0);
        color.x = v5;
        color.z = v5;
    } else if (colorScheme == 14) {
        color.y = bitValue(st2, freq, n);
        color.x = bitValue(st2, freq, n + 1.0);
    } else if (colorScheme == 15) {
        color.x = bitValue(st2, freq, n);
        let v6 = bitValue(st2, freq, n + 1.0);
        color.z = v6;
        color.y = v6;
    } else if (colorScheme == 20) {
        color.x = bitValue(st2, freq, n);
        color.y = bitValue(st2, freq, n + 1.0);
        color.z = bitValue(st2, freq, n + 2.0);
    }

    return color;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;

    let c = v * s;
    let x = c * (1.0 - abs(mod_f(h * 6.0, 2.0) - 1.0));
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
    } else {
        rgb = vec3<f32>(0.0);
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
            h = mod_f((g - b) / delta, 6.0) / 6.0;
        } else if (maxc == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (maxc == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }

    let s = select(0.0, delta / maxc, maxc != 0.0);
    let v = maxc;

    return vec3<f32>(h, s, v);
}

fn maskValueXY(st: vec2<f32>, xFreq: f32, yFreq: f32, s: f32) -> f32 {
    return constant(st, xFreq, yFreq, s);
}

fn maskValue(st: vec2<f32>, freq: f32, s: f32) -> f32 {
    return maskValueXY(st, freq, freq, s);
}

fn arecibo(st: vec2<f32>, xFreq: f32, yFreq: f32, _seed: i32) -> f32 {
    let xMod = mod_f(floor(st.x * xFreq), xFreq);
    let yMod = mod_f(floor(st.y * yFreq), yFreq);

    var v = 1.0;

    if (xMod == 0.0 || yMod == 0.0 || xMod == (xFreq - 1.0) || yMod == (yFreq - 1.0)) {
        v = 0.0;
    } else if (yMod == 1.0) {
        v = select(0.0, 1.0, xMod == 1.0);
    } else {
        v = maskValueXY(st, xFreq, yFreq, f32(_seed));
    }

    return v;
}

fn areciboNum(st: vec2<f32>, freq: f32, _seed: i32) -> f32 {
    return arecibo(st, floor(freq * 0.5) + 1.0, floor(freq), _seed);
}

fn glyphs(st: vec2<f32>, freq: f32, _seed: i32) -> f32 {
    let xFreq = floor(freq * 0.75);

    let xMod = mod_f(floor(st.x * xFreq), xFreq);
    let yMod = mod_f(floor(st.y * freq), freq);

    var v = 1.0;

    if (xMod == 0.0 || yMod == 0.0 || xMod == (xFreq - 1.0) || yMod == (freq - 1.0)) {
        v = 0.0;
    } else {
        v = maskValueXY(st, xFreq, freq, f32(_seed));
    }

    return v;
}

fn invaders(st: vec2<f32>, freq: f32, _seed: i32) -> f32 {
    let xMod = mod_f(floor(st.x * freq), freq);
    let yMod = mod_f(floor(st.y * freq), freq);

    var v = 1.0;

    if (xMod == 0.0 || yMod == 0.0 || xMod == (freq - 1.0) || yMod == (freq - 1.0)) {
        v = 0.0;
    } else if (xMod >= freq * 0.5) {
        v = maskValue(vec2<f32>(floor(st.x) + (1.0 - fract(st.x)), st.y), freq, f32(_seed));
    } else {
        v = maskValue(st, freq, f32(_seed));
    }

    return v;
}

fn bitMaskValue(st: vec2<f32>, freq: f32, _seed: i32) -> f32 {
    var v = 1.0;

    if (maskFormula == 10 || maskFormula == 11) {
        v = invaders(st, freq, _seed);
    } else if (maskFormula == 20) {
        v = glyphs(st, freq, _seed);
    } else if (maskFormula == 30) {
        v = areciboNum(st, freq, _seed);
    }

    return v;
}

fn bitMask(st: vec2<f32>) -> vec3<f32> {
    var color = vec3<f32>(0.0);

    var st2 = st;
    let aspectRatio = resolution.x / resolution.y;
    st2 = st2 - vec2<f32>(0.5 * aspectRatio, 0.5);
    st2 = st2 * tiles;
    st2 = st2 + vec2<f32>(0.5 * aspectRatio, 0.5);

    st2.x = st2.x - 0.5 * aspectRatio;

    if (maskFormula == 11) {
        st2.y = st2.y * 2.0;
    }

    let freq = floor(map(complexity, 1.0, 100.0, 5.0, 12.0));

    let mask = select(0.0, 1.0, bitMaskValue(st2, freq, -100) > 0.5);

    if (maskColorScheme == 0) {
        color = vec3<f32>(mask);
    } else {
        let baseHue = 0.01 + maskValue(st2, 1.0, -100.0) * baseHueRange * 0.01;

        color.x = fract(baseHue + bitMaskValue(st2, freq, 0) * hueRange * 0.01 + (1.0 - (hueRotation / 360.0))) * mask;

        if (maskColorScheme == 3) {
            color.y = mask;
        } else {
            color.y = bitMaskValue(st2, freq, 25) * mask;
        }

        if (maskColorScheme == 2 || maskColorScheme == 3) {
            color.z = mask;
        } else {
            color.z = bitMaskValue(st2, freq, 50) * mask;
        }

        color = hsv2rgb(color);
    }
    return color;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    seed = uniforms.data[0].w;

    formula = i32(uniforms.data[1].x);
    colorScheme = i32(uniforms.data[1].y);
    n = uniforms.data[1].z;
    interp = i32(uniforms.data[1].w);

    scale = uniforms.data[2].x;
    rotation = uniforms.data[2].y;
    speed = uniforms.data[2].z;
    mode = i32(uniforms.data[2].w);

    maskFormula = i32(uniforms.data[3].x);
    tiles = uniforms.data[3].y;
    complexity = uniforms.data[3].z;
    maskColorScheme = i32(uniforms.data[3].w);

    hueRange = uniforms.data[4].x;
    hueRotation = uniforms.data[4].y;
    baseHueRange = uniforms.data[4].z;

    var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    var st = pos.xy;

    if (mode == 0) {
        color = vec4<f32>(bitField(st), color.a);
    } else {
        st = pos.xy / resolution.y;
        st = st + f32(seed) + 1000.0;
        color = vec4<f32>(bitMask(st), color.a);
    }

    var st2 = pos.xy / resolution;

    return color;
}

