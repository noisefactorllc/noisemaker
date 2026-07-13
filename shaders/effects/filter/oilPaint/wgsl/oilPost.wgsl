/*
 * Oil Paint - post pass: reshapes the flattened (oilFlatten) result into
 * one of six classic-filter fidelity painterly looks selected by MODE, then
 * applies a shared granulation pass to every mode. See glsl/oilPost.glsl
 * for the full per-mode algorithm description. MODE is a compile-time
 * const injected by the runtime via injectDefines (see definition.js
 * globals.mode.define), same mechanism as filter/texture and filter/grain.
 * globalCoord = floor(pos.xy) + tileOffset is the WGSL equivalent of
 * GLSL's globalCoord (floor(gl_FragCoord.xy) + tileOffset); tileOffset is
 * runtime-provided so the grain/paper hash stays continuous across CLI
 * render tiles, same as filter/wind and filter/scatter. Unlike wind/scatter
 * (which keep the raw +0.5-centered coordinate symmetrically between
 * backends, no floor()), oilPaint floor()s it down to an integer pixel
 * coordinate -- a stricter, independent choice made here to satisfy an
 * integer-derived noise/hash input, not a convention borrowed from
 * wind/scatter.
 */

struct Uniforms {
    size: f32,
    detail: f32,
    textureAmount: f32,
    seed: i32,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var flatTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash12(i + vec2<f32>(0.0, 1.0)), hash12(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn fbm(p_in: vec2<f32>) -> f32 {
    var p = p_in;
    var v = 0.0;
    var a = 0.5;
    for (var i: i32 = 0; i < 5; i++) {
        v += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// Sobel gradient gradient, applied to the FLATTENED texture (fresco/dryBrush edges).
fn lumGradientFlat(uv: vec2<f32>) -> vec2<f32> {
    let texSize = vec2<f32>(textureDimensions(flatTex));
    let px = 1.0 / texSize;
    let tl = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>(-1.0,  1.0)).rgb);
    let l  = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>(-1.0,  0.0)).rgb);
    let bl = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>(-1.0, -1.0)).rgb);
    let tr = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>( 1.0,  1.0)).rgb);
    let r  = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>( 1.0,  0.0)).rgb);
    let br = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>( 1.0, -1.0)).rgb);
    let t  = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>( 0.0,  1.0)).rgb);
    let b  = lum(textureSample(flatTex, inputSampler, uv + px * vec2<f32>( 0.0, -1.0)).rgb);
    return vec2<f32>(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                      tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

// 3x3 tent blur of the flattened texture. Shared by daubs' unsharp
// mask (MODE 1) and knife's softening blend (MODE 4) -- same blur, ONE WAY
// ONLY; only the per-mode mix weight differs.
fn tent3x3(uv: vec2<f32>) -> vec3<f32> {
    let texSize = vec2<f32>(textureDimensions(flatTex));
    let px = 1.0 / texSize;
    var sum = vec3<f32>(0.0);
    var wsum = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            let w = select(1.0, 2.0, dx == 0) * select(1.0, 2.0, dy == 0);
            sum += textureSample(flatTex, inputSampler, uv + vec2<f32>(f32(dx), f32(dy)) * px).rgb * w;
            wsum += w;
        }
    }
    return sum / wsum;
}

fn sCurve(x: f32) -> f32 {
    let t = clamp(x, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// Dispatch to the active mode's reshape -- single variant selected at
// compile time by the MODE const (Dawn constant-folds).
fn modeColor(uv: vec2<f32>, c: vec3<f32>, globalCoord: vec2<f32>) -> vec3<f32> {
    if (MODE == 0) {
        return c;
    }
    if (MODE == 1) {
        let blurred = tent3x3(uv);
        return c + (c - blurred) * (uniforms.detail / 25.0);
    }
    if (MODE == 2) {
        // GLSL round() ties are implementation-defined; floor(x + 0.5) is a
        // deterministic round-half-up that matches GLSL bit-for-bit.
        let levels = floor(mix(8.0, 3.0, uniforms.detail / 100.0) + 0.5);
        let poster = floor(c * levels) / levels;
        let gradMag = length(lumGradientFlat(uv));
        // 1.5 is the gradient-to-alpha gain and 0.15 caps edge darkening.
        // This reuses fresco's
        // (MODE 3) lumGradientFlat helper but applies it as a subtler,
        // capped darken rather than fresco's stronger detail-scaled darken.
        let edgeDarken = clamp(gradMag * 1.5, 0.0, 1.0) * 0.15;
        return poster * (1.0 - edgeDarken);
    }
    if (MODE == 3) {
        let gradMag = length(lumGradientFlat(uv));
        let darkened = c * (1.0 - 0.6 * (uniforms.detail / 100.0) * gradMag);
        return vec3<f32>(sCurve(darkened.x), sCurve(darkened.y), sCurve(darkened.z));
    }
    if (MODE == 4) {
        let blurred = tent3x3(uv);
        return mix(c, blurred, uniforms.detail / 100.0);
    }
    // sponge (5, default/fallback)
    let band = fbm((globalCoord + f32(uniforms.seed) * 37.0) / (4.0 + uniforms.size));
    let shift = (band * 2.0 - 1.0) * (uniforms.detail / 100.0) * 0.25;
    return clamp(c + vec3<f32>(shift), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let c = textureSample(flatTex, inputSampler, uv).rgb;

    // Tile-aware integer global pixel coordinate for noise/hash inputs,
    // matching GLSL's floor(gl_FragCoord.xy) + tileOffset (see file header).
    let globalCoord = floor(pos.xy) + uniforms.tileOffset;

    var outc = modeColor(uv, c, globalCoord);

    let grained = outc * (0.85 + 0.3 * vnoise(globalCoord / 2.0));
    outc = mix(outc, grained, (uniforms.textureAmount / 100.0) * 0.5);

    return vec4<f32>(clamp(outc, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
