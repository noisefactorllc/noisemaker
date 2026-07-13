/*
 * Lens Flare - classic additive lens flare. See lensFlare.glsl
 * for the full algorithm derivation - this is a 1:1 port, including its
 * tile-aware GLOBAL flare-geometry UV: uniforms.tileOffset converts the
 * tile-local fragment position to the global pixel coordinate, and
 * uniforms.fullResolution - falling back to textureDimensions(inputTex)
 * when unset, matching filter/texture's WGSL guard - normalizes it to
 * the global UV the flare/ghost-chain geometry is anchored to, so the
 * flare reads as one continuous pattern across CLI render tiles instead
 * of re-centering per tile. This effect never resamples inputTex at a
 * displaced position - it only ADDS energy on top of each pixel's own
 * color - so the source is still sampled once at the fragment's own
 * (tile-local) UV (pos.xy / textureDimensions(inputTex)), independent
 * of the global UV above.
 *
 * uniforms.centerX/centerY are used directly, with no 1.0-centerY flip:
 * flarePos is a position-derived vector (built from the fragment
 * position's own coordinate space, like spinBlur's rotation center),
 * and the WebGPU present-path flip cancels the raw convention
 * difference against GLSL's gl_FragCoord-based UV, so writing centerY
 * unflipped here lands the flare on the same screen position as the
 * GLSL backend. Every shape primitive below (core glow, streak, star,
 * hex mask, circle/ring ghosts, halo band) is even/mirror-symmetric
 * under a Y flip by construction (squared distances, cos(6*phi), or a
 * 3-axis abs(dot(...)) max over an axis set closed under reflection),
 * so flarePos's raw placement is the only orientation-sensitive
 * quantity in this port.
 *
 * Struct field order matters for WGSL's default (std140-compatible)
 * uniform layout: the three f32 scalars before tint sum to 12 bytes:
 * the packer (parseWgslStructByteLayout) rounds that up to tint's
 * 16-byte alignment automatically, the same padding a native WGSL
 * compiler would insert, so no manual padding field is needed.
 *
 * LENS_TYPE is a compile-time const injected by the runtime
 * (injectDefines, see definition.js `globals.lensType.define`), not a
 * uniforms struct field. Each lens type selects a fully distinct
 * ghost-chain table (6/4/3 elements); baking LENS_TYPE lets Dawn
 * constant-fold the dispatch and drop the other tables' dead branches
 * instead of evaluating every ghost for every pixel.
 */

struct Uniforms {
    brightness: f32,
    centerX: f32,
    centerY: f32,
    tint: vec3<f32>,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.28318530717958647692;

// Aspect-corrected point at parameter t along the flare axis.
fn flareAxis(flarePos: vec2<f32>, mirrorPos: vec2<f32>, t: f32, aspectRatio: f32) -> vec2<f32> {
    var a = mix(flarePos, mirrorPos, t);
    a.x = a.x * aspectRatio;
    return a;
}

// Bright core: a tight Gaussian spike plus a wider soft glow skirt.
fn coreGlow(d: f32) -> f32 {
    return exp(-d * d * 900.0) * 1.2 + exp(-d * 8.0) * 0.4;
}

// Anamorphic streak: very tight vertically (dy weighted 4000x), long
// horizontally (dx weighted 18x).
fn anamorphicStreak(delta: vec2<f32>) -> f32 {
    return exp(-(delta.y * delta.y * 4000.0 + delta.x * delta.x * 18.0));
}

// 6-point star: cos(6*phi) spikes every 60 degrees around the flare.
fn sixPointStar(delta: vec2<f32>, d: f32) -> f32 {
    let phi = atan2(delta.y, delta.x);
    return pow(max(0.0, cos(6.0 * phi)), 40.0) * exp(-d * 5.0) * 0.5;
}

// Simple 3-phase cosine palette for the halo's rainbow tint - see
// lensFlare.glsl's header comment for the rationale.
fn haloRainbow(dc: f32) -> vec3<f32> {
    let phase = vec3<f32>(dc * 10.0) + vec3<f32>(0.0, 0.3333333, 0.6666667);
    return vec3<f32>(0.5) + vec3<f32>(0.5) * cos(TAU * phase);
}

// Halo ring: a narrow band centered at radius 0.28 around the mirrored
// point (t=1.0).
fn haloBand(dc: f32) -> f32 {
    return exp(-abs(dc - 0.28) * 60.0) * 0.25;
}

// Filled-disc ghost with a soft edge. The edge order is deliberately
// reversed (edge0=size is farther out than edge1=size*0.6) - see
// lensFlare.glsl's header comment; WGSL's smoothstep uses the same
// clamp+Hermite polynomial as GLSL's regardless of edge order, so this
// matches bit-for-bit across backends.
fn circleGhost(dist: f32, size: f32) -> f32 {
    return (1.0 - smoothstep(size * 0.6, size, dist));
}

// Same idiom as circleGhost but with a wider falloff band, used for
// prime105's large "soft circle" ghosts.
fn softCircleGhost(dist: f32, size: f32) -> f32 {
    return (1.0 - smoothstep(size * 0.3, size, dist));
}

// Hollow ring ghost: an outer soft disc minus a smaller inner soft disc.
fn ringGhost(dist: f32, size: f32) -> f32 {
    let outer = (1.0 - smoothstep(size * 0.6, size, dist));
    let inner = (1.0 - smoothstep(size * 0.3, size * 0.6, dist));
    return outer - inner;
}

// Regular-hexagon "distance": max of abs(dot(p, axis)) over 3 axes 60
// degrees apart.
fn hexDist(p: vec2<f32>) -> f32 {
    let a0 = vec2<f32>(1.0, 0.0);
    let a1 = vec2<f32>(0.5, 0.8660254038);
    let a2 = vec2<f32>(-0.5, 0.8660254038);
    let d0 = abs(dot(p, a0));
    let d1 = abs(dot(p, a1));
    let d2 = abs(dot(p, a2));
    return max(d0, max(d1, d2));
}

fn hexGhost(delta: vec2<f32>, size: f32) -> f32 {
    return (1.0 - smoothstep(size * 0.6, size, hexDist(delta)));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }
    let aspectRatio = fullDims.x / fullDims.y;
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = globalCoord / fullDims;
    let localUV = pos.xy / texSize;

    let src = textureSample(inputTex, inputSampler, localUV);

    let flarePos = vec2<f32>(uniforms.centerX, uniforms.centerY);
    let mirrorPos = vec2<f32>(1.0) - flarePos;

    var p = uv;
    p.x = p.x * aspectRatio;

    let aFlare = flareAxis(flarePos, mirrorPos, 0.0, aspectRatio);
    let delta0 = p - aFlare;
    let d0 = length(delta0);

    var flare = vec3<f32>(0.0);

    // Core glow (all lens types).
    flare = flare + vec3<f32>(coreGlow(d0));

    // Anamorphic streak (all lens types; doubled for moviePrime).
    var streakVal = anamorphicStreak(delta0);
    if (LENS_TYPE == 3) {
        streakVal = streakVal * 2.0;
    }
    flare = flare + vec3<f32>(streakVal);

    // 6-point star: zoom50_300 and moviePrime only.
    if (LENS_TYPE == 0 || LENS_TYPE == 3) {
        flare = flare + vec3<f32>(sixPointStar(delta0, d0));
    }

    // Rainbow halo ring at t=1.0 (all lens types).
    let aMirror = flareAxis(flarePos, mirrorPos, 1.0, aspectRatio);
    let dc = length(p - aMirror);
    flare = flare + haloRainbow(dc) * haloBand(dc);

    // Ghost chain: table selected by lensType.
    var g = vec2<f32>(0.0);
    if (LENS_TYPE == 0 || LENS_TYPE == 3) {
        // zoom50_300 (also the base table for moviePrime): 6 ghosts,
        // the largest (t=1.55) rendered hollow for classic-look variety.
        g = flareAxis(flarePos, mirrorPos, 0.25, aspectRatio);
        flare = flare + vec3<f32>(1.00, 0.85, 0.60) * circleGhost(length(p - g), 0.06) * 0.35;

        g = flareAxis(flarePos, mirrorPos, 0.4, aspectRatio);
        flare = flare + vec3<f32>(0.40, 0.90, 0.85) * circleGhost(length(p - g), 0.10) * 0.25;

        g = flareAxis(flarePos, mirrorPos, 0.6, aspectRatio);
        flare = flare + vec3<f32>(0.65, 0.40, 0.95) * circleGhost(length(p - g), 0.045) * 0.45;

        g = flareAxis(flarePos, mirrorPos, 0.85, aspectRatio);
        flare = flare + vec3<f32>(0.45, 0.90, 0.50) * circleGhost(length(p - g), 0.14) * 0.18;

        g = flareAxis(flarePos, mirrorPos, 1.2, aspectRatio);
        flare = flare + vec3<f32>(1.00, 0.55, 0.20) * circleGhost(length(p - g), 0.08) * 0.30;

        g = flareAxis(flarePos, mirrorPos, 1.55, aspectRatio);
        flare = flare + vec3<f32>(0.40, 0.55, 1.00) * ringGhost(length(p - g), 0.20) * 0.12;
    } else if (LENS_TYPE == 1) {
        // prime35: 4 tight hexagon ghosts.
        g = flareAxis(flarePos, mirrorPos, 0.3, aspectRatio);
        flare = flare + vec3<f32>(1.00, 0.80, 0.55) * hexGhost(p - g, 0.04) * 0.35;

        g = flareAxis(flarePos, mirrorPos, 0.55, aspectRatio);
        flare = flare + vec3<f32>(0.85, 0.85, 0.92) * hexGhost(p - g, 0.055) * 0.30;

        g = flareAxis(flarePos, mirrorPos, 0.8, aspectRatio);
        flare = flare + vec3<f32>(0.95, 0.70, 0.50) * hexGhost(p - g, 0.065) * 0.25;

        g = flareAxis(flarePos, mirrorPos, 1.3, aspectRatio);
        flare = flare + vec3<f32>(0.80, 0.85, 0.95) * hexGhost(p - g, 0.08) * 0.20;
    } else {
        // prime105: 3 large soft circles.
        g = flareAxis(flarePos, mirrorPos, 0.45, aspectRatio);
        flare = flare + vec3<f32>(0.92, 0.85, 0.78) * softCircleGhost(length(p - g), 0.12) * 0.25;

        g = flareAxis(flarePos, mirrorPos, 0.9, aspectRatio);
        flare = flare + vec3<f32>(0.85, 0.88, 0.95) * softCircleGhost(length(p - g), 0.16) * 0.20;

        g = flareAxis(flarePos, mirrorPos, 1.5, aspectRatio);
        flare = flare + vec3<f32>(0.95, 0.88, 0.80) * softCircleGhost(length(p - g), 0.20) * 0.15;
    }

    var outFlare = flare * uniforms.tint * (uniforms.brightness / 100.0);
    if (LENS_TYPE == 3) {
        // moviePrime: cooler overall tint multiplier on top of the
        // user's tint.
        outFlare = outFlare * vec3<f32>(0.9, 0.95, 1.1);
    }

    return vec4<f32>(clamp(src.rgb + outFlare, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
