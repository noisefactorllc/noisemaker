/*
 * Hatch - single-pass six-mode sketch engine. See glsl/hatch.glsl for the
 * full per-mode algorithm derivation and mode mapping; this is a
 * 1:1 port. MODE is a compile-time const injected by the runtime (see
 * definition.js globals.mode.define), same mechanism as filter/oilPaint
 * and filter/texture.
 *
 * tileOffset converts tile-local positions into the global procedural
 * coordinate gc (floor(pos.xy) + tileOffset) so the hatch pattern is
 * seamless across CLI render tiles, matching glsl/hatch.glsl's gc and
 * filter/stipple's WGSL tileOffset handling. It is zero for ordinary
 * full-frame renders. textureDimensions(inputTex) still stands in for
 * GLSL's resolution elsewhere (uv, lumGradient's texel step).
 *
 * Every stroke-field rotation matches GLSL's column-major
 * mat2(c,-s,s,c) multiplication numerically: (c*x+s*y,-s*x+c*y).
 * Keeping the same transform is required for the selected stroke
 * direction to have the same screen-space slope on both backends.
 * Every noise/hash helper below is built from WGSL's
 * `floor`/`fract`, which - like GLSL's - are floor-based (not truncated)
 * for negative inputs, so the negative positions a rotation can produce
 * need no separate floored-mod wrap.
 */

struct Uniforms {
    strokeLength: f32,
    direction: i32,
    balance: f32,
    pressure: f32,
    inkColor: vec3<f32>,
    paperColor: vec3<f32>,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// hash - hash / jitter.
fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

// luminance - luminance.
fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// value noise - value noise + fBm.
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

// Sobel gradient - gradient (Sobel on luminance), used by coloredPencil to bend
// strokes along image contours.
fn lumGradient(uv: vec2<f32>) -> vec2<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let px = 1.0 / texSize;
    let tl = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>(-1.0,  1.0)).rgb);
    let l  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>(-1.0,  0.0)).rgb);
    let bl = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>(-1.0, -1.0)).rgb);
    let tr = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 1.0,  1.0)).rgb);
    let r  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 1.0,  0.0)).rgb);
    let br = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 1.0, -1.0)).rgb);
    let t  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 0.0,  1.0)).rgb);
    let b  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 0.0, -1.0)).rgb);
    return vec2<f32>(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                      tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

// ink/paper tonemapping - ink/paper tonemap.
fn tonemap2(t: f32, ink: vec3<f32>, paper: vec3<f32>) -> vec3<f32> {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

// Numeric expansion of GLSL mat2(co,-si,si,co) * v.
fn rotate2D(v: vec2<f32>, angleDeg: f32) -> vec2<f32> {
    let a = radians(angleDeg);
    let co = cos(a);
    let si = sin(a);
    return vec2<f32>(co * v.x + si * v.y, -si * v.x + co * v.y);
}

// direction (0..3) -> stroke angle in degrees: rightDiag/horizontal/
// leftDiag/vertical.
fn dirAngle(d: i32) -> f32 {
    if (d == 1) { return 0.0; }
    if (d == 2) { return 135.0; }
    if (d == 3) { return 90.0; }
    return 45.0; // rightDiag (0, default)
}

// Shared stroke field: elongated value noise along angleDeg. See
// hatch.glsl's strokeField for the frequency rationale.
fn strokeField(gc: vec2<f32>, angleDeg: f32, stretchAmt: f32) -> f32 {
    let p = rotate2D(gc, angleDeg) * vec2<f32>(1.0 / stretchAmt, 0.9);
    return vnoise(p);
}

// Per-mode dispatch -- MODE is a compile-time const (Dawn constant-folds),
// mirroring filter/oilPaint's oilPost.wgsl modeColor structure: sequential
// `if (MODE == N) { return ...; }` checks with the last mode (coloredPencil,
// 5) as the unconditional fallback.
fn hatchColor(gc: vec2<f32>, uv: vec2<f32>, src: vec3<f32>, theta: f32, stretchAmt: f32, t: f32, pb: f32, s: f32) -> vec3<f32> {
    if (MODE == 0) {
        // Graphic Pen: see hatch.glsl MODE==0 for the pressure-nudge
        // rationale (zero at pressure=50, matching the core formula).
        let inkMask = step(s, clamp(1.0 - t + pb * 0.3, 0.0, 1.0));
        return tonemap2(1.0 - inkMask, uniforms.inkColor, uniforms.paperColor);
    }
    if (MODE == 1) {
        // Charcoal.
        let s2 = strokeField(gc * 2.0 + 91.7, theta, stretchAmt * 0.5);
        let rough = s * 0.6 + s2 * 0.4;
        let shadow = 1.0 - smoothstep(0.15, 0.55, t);
        let coverage = clamp(shadow + pb * 0.5, 0.0, 1.0);
        let inkMask = step(1.0 - coverage, rough);
        let darkness = mix(0.55, 1.0, uniforms.pressure / 100.0);
        let inkC = mix(uniforms.paperColor, uniforms.inkColor, darkness);
        return mix(uniforms.paperColor, inkC, inkMask);
    }
    if (MODE == 2) {
        // Chalk & Charcoal.
        let midGray = mix(uniforms.inkColor, uniforms.paperColor, 0.5);
        let sBg = strokeField(gc, theta + 90.0, stretchAmt);
        let aa = mix(0.4, 0.04, uniforms.pressure / 100.0);
        let fgGate = 1.0 - smoothstep(0.4 - aa, 0.4 + aa, t);
        let fgMask = step(1.0 - fgGate, s);
        let bgGate = smoothstep(0.6 - aa, 0.6 + aa, t);
        let bgMask = step(1.0 - bgGate, sBg);
        var outc = midGray;
        outc = mix(outc, uniforms.inkColor, fgMask);
        outc = mix(outc, uniforms.paperColor, bgMask);
        return outc;
    }
    if (MODE == 3) {
        // Conte Crayon.
        let toneGate = smoothstep(0.3, 0.7, t);
        let texture2 = mix(s, fbm(gc / (stretchAmt * 0.6) + 41.0), 0.5);
        var level = mix(texture2, toneGate, abs(toneGate * 2.0 - 1.0));
        level = clamp(level + pb * 0.15, 0.0, 1.0);
        return tonemap2(level, uniforms.inkColor, uniforms.paperColor);
    }
    if (MODE == 4) {
        // Crosshatch (color-preserving).
        let s45a = strokeField(gc, theta + 45.0, stretchAmt);
        let s45b = strokeField(gc, theta - 45.0, stretchAmt);
        let band1 = 1.0 - smoothstep(0.65, 0.85, t);
        let band2 = 1.0 - smoothstep(0.35, 0.55, t);
        let band3 = 1.0 - smoothstep(0.05, 0.25, t);
        let darkGain = mix(0.25, 1.0, uniforms.pressure / 100.0);
        let f0 = 1.0 - band1 * darkGain * (1.0 - s);
        let f1 = 1.0 - band2 * darkGain * (1.0 - s45a);
        let f2 = 1.0 - band3 * darkGain * (1.0 - s45b);
        return clamp(src * f0 * f1 * f2, vec3<f32>(0.0), vec3<f32>(1.0));
    }
    // coloredPencil (5) - fallback arm (MODE is always 0-5, injected by
    // the runtime, so the last value needs no explicit check).
    // Color-preserving.
    let grad = lumGradient(uv);
    let gradMag = length(grad);
    let edgeAngle = degrees(atan2(grad.y, grad.x)) + 90.0;
    let sEdge = strokeField(gc, edgeAngle, stretchAmt);
    let edgeBoost = clamp(gradMag * 3.0, 0.0, 1.0);
    let sCombined = mix(s, sEdge, edgeBoost);
    let coverage = clamp((1.0 - t) + pb * 0.4, 0.0, 1.0);
    let strokeMask = step(1.0 - coverage, sCombined);
    return mix(uniforms.paperColor, src, strokeMask);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let gc = floor(pos.xy) + uniforms.tileOffset;

    let theta = dirAngle(uniforms.direction);
    let stretchAmt = mix(4.0, 40.0, uniforms.strokeLength / 100.0);
    let t = lum(src.rgb) + (uniforms.balance - 50.0) / 100.0;
    let pb = (uniforms.pressure - 50.0) / 100.0;
    let s = strokeField(gc, theta, stretchAmt);

    let outColor = hatchColor(gc, uv, src.rgb, theta, stretchAmt, t, pb, s);

    return vec4<f32>(clamp(outColor, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
