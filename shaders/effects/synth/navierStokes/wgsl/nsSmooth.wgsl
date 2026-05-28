/*
 * WGSL Navier-Stokes smoothing pass.
 * Mirrors glsl/nsSmooth.glsl: applies the selected kernel during upsample from compute canvas
 * to intermediate smoothed canvas. All 7 sim-tag modes (constant, linear, hermite,
 * catmullRom3x3, catmullRom4x4, bSpline3x3, bSpline4x4).
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, smoothing, _)
    // data[1] reserved for layout padding
    data : array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var canvasTex : texture_2d<f32>;

fn fetchTex(idx: vec2<i32>, minIdx: vec2<i32>, maxIdx: vec2<i32>) -> vec4<f32> {
    return textureLoad(canvasTex, clamp(idx, minIdx, maxIdx), 0);
}

fn quad3v(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;
    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

fn bicubic4v(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, p3: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;
    let t3 = t2 * t;
    let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let b3 = t3 / 6.0;
    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

fn catmull3v(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;
    let t3 = t2 * t;
    let m = 0.5 * (p2 - p0);
    return (2.0*t3 - 3.0*t2 + 1.0) * p1 +
           (t3 - 2.0*t2 + t) * m +
           (-2.0*t3 + 3.0*t2) * p2 +
           (t3 - t2) * m;
}

fn catmull4v(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, p3: vec4<f32>, t: f32) -> vec4<f32> {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let smoothing = i32(uniforms.data[0].z);

    let texSize = vec2<i32>(textureDimensions(canvasTex, 0));
    let texSizeF = vec2<f32>(texSize);
    let minIdx = vec2<i32>(0);
    let maxIdx = texSize - vec2<i32>(1);

    let uv = pos.xy / resolution;
    let texelPos = uv * texSizeF - vec2<f32>(0.5);
    let baseI = vec2<i32>(floor(texelPos));
    let f = fract(texelPos);

    var sampled : vec4<f32>;

    if (smoothing == 0) {
        let idx = clamp(vec2<i32>(floor(texelPos + 0.5)), minIdx, maxIdx);
        sampled = textureLoad(canvasTex, idx, 0);
    } else if (smoothing == 2) {
        let v00 = fetchTex(baseI,                            minIdx, maxIdx);
        let v10 = fetchTex(baseI + vec2<i32>(1, 0),          minIdx, maxIdx);
        let v01 = fetchTex(baseI + vec2<i32>(0, 1),          minIdx, maxIdx);
        let v11 = fetchTex(baseI + vec2<i32>(1, 1),          minIdx, maxIdx);
        let w = smoothstep(vec2<f32>(0.0), vec2<f32>(1.0), f);
        let v0 = mix(v00, v10, vec4<f32>(w.x));
        let v1 = mix(v01, v11, vec4<f32>(w.x));
        sampled = mix(v0, v1, vec4<f32>(w.y));
    } else if (smoothing == 3) {
        var p : array<vec4<f32>, 9>;
        for (var j: i32 = 0; j < 3; j = j + 1) {
            for (var i: i32 = 0; i < 3; i = i + 1) {
                p[j * 3 + i] = fetchTex(baseI + vec2<i32>(i - 1, j - 1), minIdx, maxIdx);
            }
        }
        let r0 = catmull3v(p[0], p[1], p[2], f.x);
        let r1 = catmull3v(p[3], p[4], p[5], f.x);
        let r2 = catmull3v(p[6], p[7], p[8], f.x);
        sampled = catmull3v(r0, r1, r2, f.y);
    } else if (smoothing == 4) {
        var p : array<vec4<f32>, 16>;
        for (var j: i32 = 0; j < 4; j = j + 1) {
            for (var i: i32 = 0; i < 4; i = i + 1) {
                p[j * 4 + i] = fetchTex(baseI + vec2<i32>(i - 1, j - 1), minIdx, maxIdx);
            }
        }
        let r0 = catmull4v(p[0], p[1], p[2], p[3], f.x);
        let r1 = catmull4v(p[4], p[5], p[6], p[7], f.x);
        let r2 = catmull4v(p[8], p[9], p[10], p[11], f.x);
        let r3 = catmull4v(p[12], p[13], p[14], p[15], f.x);
        sampled = catmull4v(r0, r1, r2, r3, f.y);
    } else if (smoothing == 5) {
        var p : array<vec4<f32>, 9>;
        for (var j: i32 = 0; j < 3; j = j + 1) {
            for (var i: i32 = 0; i < 3; i = i + 1) {
                p[j * 3 + i] = fetchTex(baseI + vec2<i32>(i - 1, j - 1), minIdx, maxIdx);
            }
        }
        let r0 = quad3v(p[0], p[1], p[2], f.x);
        let r1 = quad3v(p[3], p[4], p[5], f.x);
        let r2 = quad3v(p[6], p[7], p[8], f.x);
        sampled = quad3v(r0, r1, r2, f.y);
    } else if (smoothing == 6) {
        var p : array<vec4<f32>, 16>;
        for (var j: i32 = 0; j < 4; j = j + 1) {
            for (var i: i32 = 0; i < 4; i = i + 1) {
                p[j * 4 + i] = fetchTex(baseI + vec2<i32>(i - 1, j - 1), minIdx, maxIdx);
            }
        }
        let r0 = bicubic4v(p[0], p[1], p[2], p[3], f.x);
        let r1 = bicubic4v(p[4], p[5], p[6], p[7], f.x);
        let r2 = bicubic4v(p[8], p[9], p[10], p[11], f.x);
        let r3 = bicubic4v(p[12], p[13], p[14], p[15], f.x);
        sampled = bicubic4v(r0, r1, r2, r3, f.y);
    } else {
        let v00 = fetchTex(baseI,                            minIdx, maxIdx);
        let v10 = fetchTex(baseI + vec2<i32>(1, 0),          minIdx, maxIdx);
        let v01 = fetchTex(baseI + vec2<i32>(0, 1),          minIdx, maxIdx);
        let v11 = fetchTex(baseI + vec2<i32>(1, 1),          minIdx, maxIdx);
        let v0 = mix(v00, v10, vec4<f32>(f.x));
        let v1 = mix(v01, v11, vec4<f32>(f.x));
        sampled = mix(v0, v1, vec4<f32>(f.y));
    }

    return sampled;
}
