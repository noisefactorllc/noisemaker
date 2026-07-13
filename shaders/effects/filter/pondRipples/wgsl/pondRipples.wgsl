/*
 * Pond Ripples - concentric ring distortion around the fixed image center.
 * See pondRipples.glsl for the full algorithm derivation; this is a 1:1 port.
 *
 * Tile-aware, mirroring pondRipples.glsl: tileOffset/fullResolution
 * uniforms anchor the ripple center and phase to the full image via
 * globalCoord = pos.xy + tileOffset and a global-frame uv = globalCoord /
 * fullDims (fullDims falls back to texSize, from
 * textureDimensions(inputTex), when fullResolution is unset - guard
 * matches filter/texture's MODE>=5 globalDims pattern). The ripple and
 * rotation math runs entirely in that global frame, then the distorted
 * UV is converted back to tile-local space for the inputTex sample,
 * mirroring GLSL's sampleUV = (uv * fullResolution - tileOffset) /
 * resolution.
 *
 * That final tile-local conversion is additionally gated on
 * isTile = length(tileOffset) > 0.0, which GLSL doesn't need (GLSL has
 * separate resolution/fullResolution uniforms). The runtime sets
 * fullResolution to the canvas size even when not tiling (see
 * pipeline.js updateGlobalUniforms), so fullDims is bit-identical to
 * texSize in the non-tiling case - but an unconditional
 * (uv * fullDims) / texSize round-trip is not guaranteed bit-exact for
 * non-power-of-two sizes (e.g. the 96x96 pinned-hash fixture) under
 * IEEE-754 rounding. Gating on isTile keeps the non-tiling sampleUV
 * identically `uv`, guaranteeing a byte-identical non-tiling path,
 * matching filter/pixels and filter/lensWarp's WGSL precedent.
 *
 * Rotation matches GLSL's column-major mat2(co,-s,s,co)
 * multiplication numerically: (co*x+s*y,-s*x+co*y). This preserves
 * ripple chirality across the presented WebGL2 and WebGPU images.
 *
 * Wrap mode and antialiasing match filter/pinch's
 * WGSL port (already floored-mod safe for mirror/repeat).
 *
 * STYLE and WRAP are compile-time consts injected by the runtime (see
 * definition.js `globals.style.define` / `globals.wrap.define`,
 * injectDefines in webgpu.js). They are intentionally not declared here
 * (injection-only, matching filter/texture's MODE) and are no longer
 * fields of Uniforms below.
 */

struct Uniforms {
    amount: f32,
    ridges: i32,
    antialias: i32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }
    let isTile = length(uniforms.tileOffset) > 0.0;
    let aspectRatio = fullDims.x / fullDims.y;
    let globalCoord = pos.xy + uniforms.tileOffset;
    var uv = globalCoord / fullDims;

    uv = uv - 0.5;
    uv.x = uv.x * aspectRatio;

    let r = length(uv);
    let phase = r * f32(uniforms.ridges) * 2.0 * PI;
    // Clamp the damping term at 0 so corners beyond r=1 (aspect ratios
    // wider/taller than ~1.73:1) don't invert phase and amplify instead
    // of damping.
    let damping = max(0.0, 1.0 - r);
    var w: f32;
    if (uniforms.amount <= 30.0) {
        // Preserve the original 0..30 response, including the exact shipped
        // default expression at amount=30.
        w = sin(phase) * (uniforms.amount / 100.0) * 0.05 * damping;
    } else {
        // Continue smoothly from the original default slope, then accelerate
        // toward a 2.0 gain at amount=100 (twice the previous maximum).
        let x = (uniforms.amount - 30.0) / 70.0;
        let amountGain = 0.3 + 0.7 * x + x * x;
        w = sin(phase) * amountGain * 0.05 * damping;
    }

    var rotDelta: f32 = 0.0;
    var rDelta: f32 = 0.0;
    if (STYLE == 0) {
        // aroundCenter
        rotDelta = w;
    } else if (STYLE == 1) {
        // outFromCenter
        rDelta = w;
    } else {
        // pondRipples: both at half strength
        rotDelta = w * 0.5;
        rDelta = w * 0.5;
    }

    var dir = vec2<f32>(0.0);
    if (r > 0.0) {
        dir = uv / r;
    }

    let rot = rotDelta * 2.0 * PI * 0.25;
    let s = sin(rot);
    let co = cos(rot);
    let rotatedDir = vec2<f32>(co * dir.x + s * dir.y, -s * dir.x + co * dir.y);

    uv = rotatedDir * (r + rDelta);

    uv.x = uv.x / aspectRatio;
    uv = uv + 0.5;

    // Apply wrap mode (floored-mod so negative inputs wrap correctly)
    if (WRAP == 0) {
        // mirror
        uv = abs(((uv + 1.0) % 2.0 + 2.0) % 2.0 - 1.0);
    } else if (WRAP == 1) {
        // repeat
        uv = (uv % 1.0 + 1.0) % 1.0;
    } else {
        // clamp
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    // Convert distorted global UV back to tile-local for texture sampling,
    // mirroring GLSL's sampleUV = (uv * fullResolution - tileOffset) / resolution.
    // Clamp to tile bounds so wrap modes don't sample past tile coverage.
    // Gated on isTile so the non-tiling path stays exactly `uv` (see header
    // comment for why the round-trip isn't safe to run unconditionally).
    var sampleUV = uv;
    if (isTile) {
        sampleUV = clamp((uv * fullDims - uniforms.tileOffset) / texSize, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    if (uniforms.antialias != 0) {
        let dx = dpdx(sampleUV);
        let dy = dpdy(sampleUV);
        var col = vec4<f32>(0.0);
        col += textureSample(inputTex, inputSampler, sampleUV + dx * -0.375 + dy * -0.125);
        col += textureSample(inputTex, inputSampler, sampleUV + dx *  0.125 + dy * -0.375);
        col += textureSample(inputTex, inputSampler, sampleUV + dx *  0.375 + dy *  0.125);
        col += textureSample(inputTex, inputSampler, sampleUV + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    } else {
        return textureSample(inputTex, inputSampler, sampleUV);
    }
}
