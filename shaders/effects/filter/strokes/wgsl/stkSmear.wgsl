/*
 * Strokes - stkSmear pass. See glsl/stkSmear.glsl for the full per-mode
 * algorithm derivation; this is a 1:1 port.
 * MODE is a compile-time const injected by the runtime via injectDefines
 * (see definition.js globals.mode.define), same mechanism as
 * filter/oilPaint and filter/hatch.
 *
 * Procedural brush coordinates include tileOffset so tiled renders retain
 * the same marks as the corresponding full-frame crop.
 *
 * rotate2D matches GLSL's column-major mat2(c,-s,s,c) multiplication
 * numerically so fixed brush directions keep the same presented slope
 * on both backends. lumGradient's
 * Sobel kernel offsets are backend-agnostic constants (Sobel gradient) - textually
 * identical to the GLSL version, no flip, matching filter/hatch's
 * coloredPencil lumGradient/edgeAngle precedent. See the GLSL file's
 * header for the on-screen-governs note on the two fixed diagonal fields.
 */

struct Uniforms {
    strokeLength: f32,
    balance: f32,
    intensity: f32,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const MAX_TAPS: i32 = 24;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn valueNoise2(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash12(i + vec2<f32>(0.0, 1.0)), hash12(i + vec2<f32>(1.0)), u.x), u.y);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.xx + p3.yz) * p3.zy);
}

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// Sobel gradient - gradient (Sobel on luminance); smudge (MODE 4) only. Backend-
// agnostic constant kernel offsets - textually identical to GLSL, no
// flip (see file header, filter/hatch's lumGradient). Called once per
// pixel outside smear()'s loop (uniform control flow either way), so
// textureSampleLevel isn't required here the way it is below - switched
// anyway for file-wide consistency with the loop-adjacent helpers (same
// non-mipmapped render-target texture, so LOD 0 is numerically identical
// to textureSample's implicit LOD).
fn lumGradient(uv: vec2<f32>) -> vec2<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let px = 1.0 / texSize;
    let tl = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>(-1.0,  1.0), 0.0).rgb);
    let l  = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>(-1.0,  0.0), 0.0).rgb);
    let bl = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>(-1.0, -1.0), 0.0).rgb);
    let tr = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>( 1.0,  1.0), 0.0).rgb);
    let r  = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>( 1.0,  0.0), 0.0).rgb);
    let br = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>( 1.0, -1.0), 0.0).rgb);
    let t  = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>( 0.0,  1.0), 0.0).rgb);
    let b  = lum(textureSampleLevel(inputTex, inputSampler, uv + px * vec2<f32>( 0.0, -1.0), 0.0).rgb);
    return vec2<f32>(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                      tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

// Numeric expansion of GLSL mat2(co,-si,si,co) * v.
fn rotate2D(v: vec2<f32>, angleDeg: f32) -> vec2<f32> {
    let a = radians(angleDeg);
    let co = cos(a);
    let si = sin(a);
    return vec2<f32>(co * v.x + si * v.y, -si * v.x + co * v.y);
}

fn strokeVariation(gc: vec2<f32>, dirUnit: vec2<f32>, runBase: f32) -> f32 {
    let across = vec2<f32>(-dirUnit.y, dirUnit.x);
    let strokeSpace = vec2<f32>(
        dot(gc, dirUnit) / max(runBase, 3.0),
        dot(gc, across) / 3.5,
    );
    return 0.72 + 0.56 * valueNoise2(strokeSpace * 0.65);
}

fn brushStrokeField(uv: vec2<f32>, gc: vec2<f32>, dirUnit: vec2<f32>, runBase: f32) -> vec4<f32> {
    let across = vec2<f32>(-dirUnit.y, dirUnit.x);
    let oriented = vec2<f32>(dot(gc, dirUnit), dot(gc, across));
    let spacing = vec2<f32>(max(runBase * 0.70, 4.0), 4.5);
    let baseCell = floor(oriented / spacing);
    var field = 0.0;
    var pigmentSum = vec3<f32>(0.0);
    var pigmentWeight = 0.0;
    for (var cy: i32 = -1; cy <= 1; cy++) {
        for (var cx: i32 = -1; cx <= 1; cx++) {
            let cell = baseCell + vec2<f32>(f32(cx), f32(cy));
            let jitter = hash22(cell + vec2<f32>(17.3)) - vec2<f32>(0.5);
            let center = (cell + vec2<f32>(0.5) + jitter * vec2<f32>(0.56, 0.40)) * spacing;
            let delta = oriented - center;
            let angle = (hash12(cell + vec2<f32>(29.1)) - 0.5) * 0.34;
            let co = cos(angle);
            let si = sin(angle);
            let local = vec2<f32>(co * delta.x + si * delta.y,
                                  -si * delta.x + co * delta.y);
            let halfLength = runBase * (0.35 + 0.18 * hash12(cell + vec2<f32>(43.7)));
            let halfWidth = 1.4 + 1.2 * hash12(cell + vec2<f32>(71.9));
            let capsule = length(vec2<f32>(max(abs(local.x) - halfLength, 0.0), local.y)) - halfWidth;
            // Pixel-space analytic AA remains stable when baseCell changes.
            let aa = 1.35;
            let body = 1.0 - smoothstep(-aa, aa, capsule);
            let bristle = 0.78 + 0.22 * (0.5 + 0.5 *
                sin(local.y * 5.2 + hash12(cell + vec2<f32>(97.3)) * 6.2831853));
            let mark = body * bristle;
            let centerGlobal = dirUnit * center.x + across * center.y;
            let centerUV = uv + (centerGlobal - gc) / vec2<f32>(textureDimensions(inputTex));
            pigmentSum += srcSample(centerUV).rgb * mark;
            pigmentWeight += mark;
            field = max(field, mark);
        }
    }
    var pigment = srcSample(uv).rgb;
    if (pigmentWeight > 0.0001) {
        pigment = pigmentSum / pigmentWeight;
    }
    return vec4<f32>(pigment, clamp(field, 0.0, 1.0));
}

fn sprayJitter(gc: vec2<f32>, tap: f32) -> vec2<f32> {
    let p = gc / 7.0;
    return vec2<f32>(
        valueNoise2(p + vec2<f32>(tap * 0.73, 7.0)),
        valueNoise2(p + vec2<f32>(11.0, tap * 0.79) + vec2<f32>(37.1)),
    ) - vec2<f32>(0.5);
}

fn srcSample(sampleUV: vec2<f32>) -> vec4<f32> {
    if (MODE == 3) {
        // Sumi-e reads a locally ERODED source, so the directional smear spreads
        // expanded dark ink exactly like the two-pass original (which smeared a
        // precomputed 3x3 min). A 4-neighbour cross min approximates that erosion
        // inline. Matches glsl/stkSmear.glsl; MODE-gated so other variants pay
        // nothing.
        let px = 1.0 / vec2<f32>(textureDimensions(inputTex));
        let s = textureSampleLevel(inputTex, inputSampler, sampleUV, 0.0);
        var e = s.rgb;
        e = min(e, textureSampleLevel(inputTex, inputSampler, sampleUV + vec2<f32>(px.x, 0.0), 0.0).rgb);
        e = min(e, textureSampleLevel(inputTex, inputSampler, sampleUV - vec2<f32>(px.x, 0.0), 0.0).rgb);
        e = min(e, textureSampleLevel(inputTex, inputSampler, sampleUV + vec2<f32>(0.0, px.y), 0.0).rgb);
        e = min(e, textureSampleLevel(inputTex, inputSampler, sampleUV - vec2<f32>(0.0, px.y), 0.0).rgb);
        return vec4<f32>(e, s.a);
    }
    return textureSampleLevel(inputTex, inputSampler, sampleUV, 0.0);
}

// Bounded directional accumulation - see glsl/stkSmear.glsl's smear() for
// the full algorithm description.
//
// L varies across a coherent stroke field, so a data-dependent `if (fi > L) {
// break; }` makes every srcSample() call reached after the
// break non-uniform control flow. That's fine for textureSampleLevel
// (explicit LOD, no derivatives/uniformity requirement) but a hard
// rejection for plain textureSample ("must only be called from uniform
// control flow" -- caught by the real-browser harness; MCP's compile
// check does not enforce this). Fix: every srcSample()-routed fetch below
// uses textureSampleLevel, so the break is legal and taps past L are never
// sampled --
// restores the original early-exit cost profile instead of paying for
// MAX_TAPS iterations on every pixel regardless of L. Numerically a
// no-op vs. always running the full loop and multiplicatively zeroing
// out-of-range taps (w == 0 either contributes nothing or isn't computed
// at all -- same sum, same wsum, bit-for-bit), so this is a pure
// performance fix, not a behavior change. Applied identically in the
// GLSL file (which never needed the mask -- GLSL has no uniform-control-
// flow requirement on texture()).
fn smear(uv: vec2<f32>, gc: vec2<f32>, dirUnit: vec2<f32>, L: f32, jitterPx: f32) -> vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let px = 1.0 / texSize;
    var sum = srcSample(uv);
    var wsum = 1.0;
    for (var i: i32 = 1; i <= MAX_TAPS; i++) {
        let fi = f32(i);
        if (fi > L) { break; }
        let w = exp(-2.0 * fi / L);
        var jp = vec2<f32>(0.0);
        var jn = vec2<f32>(0.0);
        if (jitterPx > 0.0) {
            jp = sprayJitter(gc, fi) * jitterPx;
            jn = sprayJitter(gc + vec2<f32>(31.7), -fi) * jitterPx;
        }
        let sampP = uv + (dirUnit * fi) * px + jp * px;
        let sampN = uv - (dirUnit * fi) * px + jn * px;
        sum += (srcSample(sampP) + srcSample(sampN)) * w;
        wsum += 2.0 * w;
    }
    return sum / wsum;
}

// Per-mode dispatch - mirrors filter/hatch's hatchColor / filter/oilPaint's
// modeColor structure (sequential if (MODE == N) checks, last mode as the
// unconditional fallback).
fn smearColor(uv: vec2<f32>, gc: vec2<f32>, src: vec4<f32>, runBase: f32) -> vec4<f32> {
    if (MODE == 0) {
        // Angled Strokes.
        let dir45 = rotate2D(vec2<f32>(1.0, 0.0), 45.0);
        let dir135 = rotate2D(vec2<f32>(1.0, 0.0), 135.0);
        let l45 = runBase * strokeVariation(gc, dir45, runBase);
        let l135 = runBase * strokeVariation(gc, dir135, runBase);
        let layer45 = brushStrokeField(uv, gc, dir45, runBase);
        let layer135 = brushStrokeField(uv, gc, dir135, runBase);
        let pigment45 = mix(smear(uv, gc, dir45, l45, 0.0), vec4<f32>(layer45.rgb, src.a), 0.72);
        let pigment135 = mix(smear(uv, gc, dir135, l135, 0.0), vec4<f32>(layer135.rgb, src.a), 0.72);
        let field45 = mix(src, pigment45, layer45.a);
        let field135 = mix(src, pigment135, layer135.a);
        let b = uniforms.balance / 100.0;
        let side = smoothstep(b - 0.1, b + 0.1, lum(src.rgb));
        return mix(field135, field45, side);
    }
    if (MODE == 1) {
        // Sprayed Strokes.
        let dir45 = rotate2D(vec2<f32>(1.0, 0.0), 45.0);
        let L = runBase * strokeVariation(gc, dir45, runBase);
        let jitterPx = uniforms.intensity / 100.0 * 6.0;
        let layer = brushStrokeField(uv, gc, dir45, runBase);
        let pigment = mix(smear(uv, gc, dir45, L, jitterPx), vec4<f32>(layer.rgb, src.a), 0.68);
        return mix(src, pigment, layer.a);
    }
    if (MODE == 2) {
        // Dark Strokes.
        let dir45 = rotate2D(vec2<f32>(1.0, 0.0), 45.0);
        let L = runBase * strokeVariation(gc, dir45, runBase);
        let layer = brushStrokeField(uv, gc, dir45, runBase);
        let pigment = mix(smear(uv, gc, dir45, L, 0.0), vec4<f32>(layer.rgb, src.a), 0.72);
        let c = mix(src, pigment, layer.a);
        let t = lum(c.rgb);
        let bAmt = uniforms.balance / 100.0;
        let exponent = select(1.0 / (1.0 + uniforms.intensity / 100.0), 1.0 + uniforms.intensity / 50.0, t < bAmt);
        return vec4<f32>(pow(max(c.rgb, vec3<f32>(0.0)), vec3<f32>(exponent)), c.a);
    }
    if (MODE == 3) {
        // Sumi-e: srcSample() returns a locally eroded source (see above), so
        // this 135deg directional smear spreads expanded dark ink along the
        // brush -- the wet-ink look of the two-pass original, in one pass.
        // Matches glsl/stkSmear.glsl. A contrast-only curve finishes it.
        let dir135 = rotate2D(vec2<f32>(1.0, 0.0), 135.0);
        let L = runBase * strokeVariation(gc, dir135, runBase);
        let layer = brushStrokeField(uv, gc, dir135, runBase);
        let pigment = mix(smear(uv, gc, dir135, L, 0.0), vec4<f32>(layer.rgb, src.a), 0.74);
        let c = mix(src, pigment, layer.a);
        return vec4<f32>(pow(max(c.rgb, vec3<f32>(0.0)), vec3<f32>(1.0 + uniforms.intensity / 50.0)), c.a);
    }
    // Smudge Stick (4) - fallback arm (MODE always 0-4, injected by the
    // runtime, so the last value needs no explicit check).
    let grad = lumGradient(uv);
    let gradMag = length(grad);
    let edgeAngle = select(45.0, degrees(atan2(grad.y, grad.x)) + 90.0, gradMag > 1e-5);
    let dir = rotate2D(vec2<f32>(1.0, 0.0), edgeAngle);
    let L = runBase * strokeVariation(gc, dir, runBase);
    let layer = brushStrokeField(uv, gc, dir, runBase);
    let pigment = mix(smear(uv, gc, dir, L, 0.0), vec4<f32>(layer.rgb, src.a), 0.64);
    let smeared = mix(src, pigment, layer.a);
    let shadowMask = 1.0 - smoothstep(0.55, 0.65, lum(src.rgb));
    return mix(src, smeared, shadowMask);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let gc = pos.xy + uniforms.tileOffset;

    let runBase = mix(3.0, 50.0, uniforms.strokeLength / 100.0);
    let outc = smearColor(uv, gc, src, runBase);

    return vec4<f32>(clamp(outc.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
