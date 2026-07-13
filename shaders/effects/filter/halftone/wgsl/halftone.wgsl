/*
 * Halftone - rotated-screen halftone reproduction. See halftone.glsl for
 * the full algorithm derivation; this is a 1:1 port.
 *
 * The explicit rotation expansion below matches GLSL's column-major
 * mat2(co, -si, si, co) multiplication exactly.
 *
 * MODE and PATTERN are compile-time consts injected by the runtime via
 * injectDefines (see definition.js `globals.mode.define` /
 * `globals.pattern.define`). Baking them lets Dawn constant-fold the
 * mode/pattern dispatch instead of carrying a runtime int dispatch through
 * every fragment. They are read bare (not through `uniforms`) and are no
 * longer struct fields.
 */

struct Uniforms {
    frequency: f32,
    cyanAngle: f32,
    magentaAngle: f32,
    yellowAngle: f32,
    blackAngle: f32,
    monoAngle: f32,
    sharpness: f32,
    inkColor: vec3<f32>,
    paperColor: vec3<f32>,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn tonemap2(t: f32, ink: vec3<f32>, paper: vec3<f32>) -> vec3<f32> {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

// Standard CMYK separation with full under-color removal. The shared
// neutral component becomes K, leaving C/M/Y at zero for neutral RGB.
fn rgbToCmyk(rgb: vec3<f32>) -> vec4<f32> {
    let k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
    let scale = max(1.0 - k, 0.00001);
    let cmy = clamp((1.0 - rgb - vec3<f32>(k)) / scale, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(cmy, k);
}

// See file header: raw-convention rotation for position-derived vectors.
// Calling this with -angleDeg gives the exact inverse rotation, which
// cellSampleFromRuv relies on below.
fn rotate2D(v: vec2<f32>, angleDeg: f32) -> vec2<f32> {
    let a = radians(angleDeg);
    let co = cos(a);
    let si = sin(a);
    return vec2<f32>(co * v.x + si * v.y, -si * v.x + co * v.y);
}

fn boxBlur3(uv: vec2<f32>, texel: vec2<f32>) -> vec3<f32> {
    var sum = vec3<f32>(0.0);
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let o = vec2<f32>(f32(x), f32(y)) * texel;
            sum += textureSample(inputTex, inputSampler, clamp(uv + o, vec2<f32>(0.0), vec2<f32>(1.0))).rgb;
        }
    }
    return sum / 9.0;
}

// Blurred RGB sampled at the center of the rotated screen cell whose
// already-rotated-and-scaled coordinate is `ruv` (= rotate2D(gc,
// angleDeg) / frequency).
fn cellSampleFromRuv(ruv: vec2<f32>, angleDeg: f32, texel: vec2<f32>) -> vec3<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let cellId = floor(ruv) + 0.5;
    let cellCenterGc = rotate2D(cellId * uniforms.frequency, -angleDeg);
    let cellUV = clamp((cellCenterGc - uniforms.tileOffset) / texSize, vec2<f32>(0.0), vec2<f32>(1.0));
    return boxBlur3(cellUV, texel);
}

fn halftoneCoverage(d: f32, value: f32, sharpnessPct: f32) -> f32 {
    let spot = sqrt(clamp(value, 0.0, 1.0)) * 0.7071;
    let softness = 1.0 - clamp(sharpnessPct / 100.0, 0.0, 1.0);
    let aa = max(mix(fwidth(d) * 1.5, 0.35, softness), 0.00001);
    return 1.0 - smoothstep(spot - aa, spot + aa, d);
}

const DOT_AREA_CAP: f32 = 0.50;
const PI: f32 = 3.141592653589793;
const MID_DOT_RADIUS: f32 = 0.39894228;
const MAX_DOT_RADIUS: f32 = 0.48;

fn roundDotCoverage(offset: vec2<f32>, value: f32, sharpnessPct: f32) -> f32 {
    let inkAmount = clamp(value, 0.0, 1.0);
    let centerDistance = length(offset);
    // Branchless form of the low/high dot-radius split. select(f, t, cond) is
    // a true select in WGSL (not an arithmetic blend), so this reproduces
    // both original arms bit-for-bit, including exactly at
    // inkAmount == DOT_AREA_CAP, where the low branch (sqrt formula) is
    // selected - matching the original strict `>` comparison.
    let inkRadius = select(
        sqrt(min(inkAmount, DOT_AREA_CAP) / PI),
        mix(MID_DOT_RADIUS, MAX_DOT_RADIUS,
            (inkAmount - DOT_AREA_CAP) / (1.0 - DOT_AREA_CAP)),
        inkAmount > DOT_AREA_CAP);
    let softness = 1.0 - clamp(sharpnessPct / 100.0, 0.0, 1.0);
    let centerAA = max(mix(fwidth(centerDistance) * 1.5, 0.35, softness), 0.00001);
    let resolvedInk = smoothstep(0.0, 1.0 / 255.0, value);
    return (1.0 - smoothstep(-centerAA, centerAA,
        centerDistance - inkRadius)) * resolvedInk;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let fullSize = select(texSize, uniforms.fullResolution, uniforms.fullResolution.x > 0.0);
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = pos.xy / texSize;
    let texel = 1.0 / texSize;
    let alpha = textureSample(inputTex, inputSampler, uv).a;

    if (MODE == 0) {
        // Subtractive color halftone.
        let ruvC = rotate2D(globalCoord, uniforms.cyanAngle) / uniforms.frequency;
        let ruvM = rotate2D(globalCoord, uniforms.magentaAngle) / uniforms.frequency;
        let ruvY = rotate2D(globalCoord, uniforms.yellowAngle) / uniforms.frequency;
        let ruvK = rotate2D(globalCoord, uniforms.blackAngle) / uniforms.frequency;
        let valC = rgbToCmyk(cellSampleFromRuv(ruvC, uniforms.cyanAngle, texel)).r;
        let valM = rgbToCmyk(cellSampleFromRuv(ruvM, uniforms.magentaAngle, texel)).g;
        let valY = rgbToCmyk(cellSampleFromRuv(ruvY, uniforms.yellowAngle, texel)).b;
        let valK = rgbToCmyk(cellSampleFromRuv(ruvK, uniforms.blackAngle, texel)).a;
        let inkC = roundDotCoverage(fract(ruvC) - 0.5, valC, uniforms.sharpness);
        let inkM = roundDotCoverage(fract(ruvM) - 0.5, valM, uniforms.sharpness);
        let inkY = roundDotCoverage(fract(ruvY) - 0.5, valY, uniforms.sharpness);
        let inkK = roundDotCoverage(fract(ruvK) - 0.5, valK, uniforms.sharpness);
        let screened = (vec3<f32>(1.0) - vec3<f32>(inkC, inkM, inkY)) * (1.0 - inkK);
        return vec4<f32>(screened, alpha);
    }

    // Monochrome screen pattern.
    var value: f32 = 0.0;
    var d: f32 = 0.0;
    var dotOffset = vec2<f32>(0.0);
    if (PATTERN == 2) {
        // circle: concentric rings from the fixed image center, unrotated.
        let center = fullSize * 0.5;
        value = 1.0 - lum(boxBlur3(uv, texel));
        let rd = length(globalCoord - center) / uniforms.frequency;
        d = abs(fract(rd) - 0.5);
    } else {
        let ruv = rotate2D(globalCoord, uniforms.monoAngle) / uniforms.frequency;
        value = 1.0 - lum(cellSampleFromRuv(ruv, uniforms.monoAngle, texel));
        let off = fract(ruv) - 0.5;
        dotOffset = off;
        d = select(length(off), abs(off.y), PATTERN == 1); // 1 = line, else dot
    }
    let ink = select(
        halftoneCoverage(d, value, uniforms.sharpness),
        roundDotCoverage(dotOffset, value, uniforms.sharpness),
        PATTERN == 0);
    return vec4<f32>(tonemap2(1.0 - ink, uniforms.inkColor, uniforms.paperColor), alpha);
}
