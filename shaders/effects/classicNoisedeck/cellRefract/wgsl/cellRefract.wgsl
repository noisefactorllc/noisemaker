/*
 * Cell refract shader (WGSL port).
 * Uses cell-noise distance fields to refract the input feed in a controllable manner.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

// SHAPE and KERNEL are compile-time consts injected by the runtime via
// injectDefines (see classicNoisedeck/cellRefract/definition.js
// `globals.{shape,kernel}.define`). Same fix as the GLSL backend.
//
// Side note: this struct previously had a `metric: i32` field used as the
// shape selector, but the JS-side uniform-writer keys by name and the global
// is named `shape`, so `metric` was always read as 0 (latent pre-existing
// bug — WGSL backend always rendered circles regardless of dropdown).
// Promoting `shape` to a compile-time define routes through injectDefines
// instead, which fixes the latent bug as a side effect.

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    // Effect params in definition.js globals order:
    // (metric/shape was here — now compile-time SHAPE)
    scale: f32,
    cellScale: f32,
    cellSmooth: f32,
    cellVariation: f32,
    speed: f32,
    // (kernel was here — now compile-time KERNEL)
    effectWidth: f32,
    refractAmt: f32,
    refractDir: f32,
    wrap: i32,
    seed: i32,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn aspectRatio() -> f32 {
    return u.resolution.x / u.resolution.y;
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

fn mapRange(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
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

fn desaturate(color: vec3f) -> vec3f {
    let avg = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return vec3f(avg);
}

fn convolve(uv: vec2f, kernel: array<f32, 9>, divide: bool) -> vec3f {
    let steps = 1.0 / u.resolution;
    let offsets = array<vec2f, 9>(
        vec2f(-steps.x, -steps.y), vec2f(0.0, -steps.y), vec2f(steps.x, -steps.y),
        vec2f(-steps.x, 0.0), vec2f(0.0, 0.0), vec2f(steps.x, 0.0),
        vec2f(-steps.x, steps.y), vec2f(0.0, steps.y), vec2f(steps.x, steps.y)
    );
    var kernelWeight = 0.0;
    var conv = vec3f(0.0);
    let ew = f32(u.effectWidth);
    for (var i = 0; i < 9; i++) {
        let color = textureSample(inputTex, samp, uv + offsets[i] * ew).rgb;
        conv += color * kernel[i];
        kernelWeight += kernel[i];
    }
    if (divide && kernelWeight != 0.0) { conv /= kernelWeight; }
    return clamp(conv, vec3f(0.0), vec3f(1.0));
}

fn derivatives(color: vec3f, uv: vec2f, divide: bool) -> vec3f {
    let deriv_x = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
    let deriv_y = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0);
    let s1 = convolve(uv, deriv_x, divide);
    let s2 = convolve(uv, deriv_y, divide);
    let dist = distance(s1, s2);
    return color * dist;
}

fn sobel(color: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    let s1 = convolve(uv, sobel_x, false);
    let s2 = convolve(uv, sobel_y, false);
    let dist = distance(s1, s2);
    return color * dist;
}

fn shadow(color_in: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    var color = rgb2hsv(color_in);
    let x = convolve(uv, sobel_x, false);
    let y = convolve(uv, sobel_y, false);
    let shade_dist = distance(x, y);
    let highlight = shade_dist * shade_dist;
    let shade = (1.0 - ((1.0 - color.z) * (1.0 - highlight))) * shade_dist;
    let alpha = 0.75;
    color = vec3f(color.x, color.y, mix(color.z, shade, alpha));
    return hsv2rgb(color);
}

fn outline(color: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    let s1 = convolve(uv, sobel_x, false);
    let s2 = convolve(uv, sobel_y, false);
    let dist = distance(s1, s2);
    return max(color - dist, vec3f(0.0));
}

fn convolutionKernel(color: vec3f, uv: vec2f) -> vec3f {
    let emboss = array<f32, 9>(-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0);
    let sharpen = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 5.0, 0.0, -1.0, 0.0, -1.0);
    let blur = array<f32, 9>(1.0, 2.0, 1.0, 2.0, 4.0, 2.0, 1.0, 2.0, 1.0);
    let edge2 = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 4.0, 0.0, -1.0, 0.0, -1.0);

    if (KERNEL == 1) { return convolve(uv, blur, true); }
    else if (KERNEL == 2) { return derivatives(color, uv, true); }
    else if (KERNEL == 120) { return clamp(derivatives(color, uv, false) * 2.5, vec3f(0.0), vec3f(1.0)); }
    else if (KERNEL == 3) { return color * convolve(uv, edge2, true); }
    else if (KERNEL == 4) { return convolve(uv, emboss, false); }
    else if (KERNEL == 5) { return outline(color, uv); }
    else if (KERNEL == 6) { return shadow(color, uv); }
    else if (KERNEL == 7) { return convolve(uv, sharpen, false); }
    else if (KERNEL == 8) { return sobel(color, uv); }
    else if (KERNEL == 9) { return max(color, convolve(uv, edge2, true)); }
    return color;
}

fn polarShape(st: vec2f, sides: i32) -> f32 {
    let a = atan2(st.x, st.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st);
}

fn shapeFn(st_in: vec2f, offset: vec2f, scale: f32) -> f32 {
    let st = st_in + offset;
    var d = 1.0;
    if (SHAPE == 0) { d = length(st * 1.2); }
    else if (SHAPE == 2) { d = polarShape(st * 1.2, 6); }
    else if (SHAPE == 3) { d = polarShape(st * 1.2, 8); }
    else if (SHAPE == 4) { d = polarShape(st * 1.5, 4); }
    else if (SHAPE == 6) { d = polarShape(vec2f(st.x, st.y + 0.05) * 1.5, 3); }
    return d * scale;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    if (k == 0.0) { return min(a, b); }
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

fn cells(st_in: vec2f, freq: f32, cellSize: f32) -> f32 {
    var st = st_in * freq;
    st += prng(vec3f(f32(u.seed), 0.0, 0.0)).xy;
    let i = floor(st);
    let f = fract(st);
    var d = 1.0;
    for (var y = -2; y <= 2; y++) {
        for (var x = -2; x <= 2; x++) {
            let n = vec2f(f32(x), f32(y));
            let wrap_coord = i + n;
            var point = prng(vec3f(wrap_coord, f32(u.seed))).xy;
            let r1 = prng(vec3f(f32(u.seed), wrap_coord)) * 0.5 - 0.25;
            let r2 = prng(vec3f(wrap_coord, f32(u.seed))) * 2.0 - 1.0;
            let speed = floor(u.speed);
            point += vec2f(sin(u.time * TAU * speed + r2.x) * r1.x, cos(u.time * TAU * speed + r2.y) * r1.y);
            let diff = n + point - f;
            var dist: f32;
            if (SHAPE == 1) {
                dist = (abs(n.x + point.x - f.x) + abs(n.y + point.y - f.y)) * cellSize;
            } else {
                dist = shapeFn(vec2f(diff.x, -diff.y), vec2f(0.0), cellSize);
            }
            dist += r1.z * (u.cellVariation * 0.01);
            d = smin(d, dist, u.cellSmooth * 0.01);
        }
    }
    return d;
}

fn posterize(color: vec3f, levIn: f32) -> vec3f {
    var lev = levIn;
    if (lev == 0.0) { return color; }
    else if (lev == 1.0) { lev = 2.0; }
    let c = clamp(color, vec3f(0.0), vec3f(0.99));
    return (floor(c * lev) + 0.5) / lev;
}

fn pixellate(uv: vec2f, size: f32) -> vec3f {
    if (size <= 1.0) { return textureSample(inputTex, samp, uv).rgb; }
    let dx = size / u.resolution.x;
    let dy = size / u.resolution.y;
    let coord = vec2f(dx * floor(uv.x / dx), dy * floor(uv.y / dy));
    return textureSample(inputTex, samp, coord).rgb;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var st = fragCoord.xy / u.resolution;

    let freq = mapRange(u.scale, 1.0, 100.0, 20.0, 1.0);
    let cellSize = mapRange(u.cellScale, 1.0, 100.0, 3.0, 0.75);
    let d = cells(st * vec2f(aspectRatio(), 1.0), freq, cellSize);
    let refAmt = mapRange(u.refractAmt, 0.0, 100.0, 0.0, 0.125);
    let refLen = d + u.refractDir / 360.0;
    st.x += cos(refLen * TAU) * refAmt;
    st.y += sin(refLen * TAU) * refAmt;

    if (u.wrap == 1) {
        st = fract(st);
    }

    var color = textureSample(inputTex, samp, st);
    let ew = f32(u.effectWidth);
    if (ew != 0.0 && KERNEL != 0) {
        if (KERNEL == 100) {
            color = vec4f(pixellate(st, ew * 4.0), color.a);
        } else if (KERNEL == 110) {
            color = vec4f(posterize(color.rgb, floor(mapRange(ew, 0.0, 10.0, 0.0, 20.0))), color.a);
        } else {
            color = vec4f(convolutionKernel(color.rgb, st), color.a);
        }
    }

    return color;
}
