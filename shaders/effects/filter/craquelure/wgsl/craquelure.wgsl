/*
 * Craquelure - cracked-plaster groove network with carved relief over the
 * image. See craquelure.glsl for the full algorithm derivation (F2-F1
 * crack metric, border wobble, central-difference wall shading via filter/relief's
 * reliefShade, fixed 135-degree light, brightness/depth composition);
 * this is a 1:1 port.
 *
 * tileOffset converts tile-local positions into global procedural
 * coordinates, matching GLSL's `gl_FragCoord.xy + tileOffset`: globalCoord
 * seeds the crack mask's Voronoi hash (via crackMask's wobble/Voronoi
 * chain) so the crack network is continuous across CLI render tiles. It
 * is zero for ordinary full-frame renders (see filter/stipple's WGSL
 * port for the same pattern). The input-texture UV stays tile-local
 * (`pos.xy / texSize`, matching GLSL's `gl_FragCoord.xy / resolution`).
 * The crack pattern is seeded by global pixel position (tileOffset + local
 * coord), never normalized by the full image size, so neither backend
 * declares a fullResolution uniform.
 *
 * Every vector built in this shader (the wobble offset, the Voronoi
 * search cell/seed geometry, the k-gradient sample taps) comes from
 * `floor`/`fract` only (hash-, value-noise-, and Voronoi-derived, no `mod`), which - like GLSL -
 * are floor-based (not truncated) for negative inputs in WGSL, so no
 * floored-mod wrap is needed anywhere here. The light vector L is a
 * plain function of the fixed 135-degree angle constant, not fragment-
 * coordinate-derived at all, so it is textually identical to the GLSL.
 */

struct Uniforms {
    spacing: f32,
    depth: f32,
    brightness: f32,
    seed: i32,
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

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.xx + p3.yz) * p3.zy);
}

// value noise - value noise (fBm not needed here).
fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash12(i + vec2<f32>(0.0, 1.0)), hash12(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

// Voronoi extended - jittered-grid Voronoi F1/F2: returns x = nearest seed
// distance (F1), y = second-nearest seed distance (F2). The 1-ring
// search is exact for F1; F2 can rarely be under-counted near a cell's
// corner at jitter's [0, 1] maximum. See craquelure.glsl's voronoiF1F2
// for the full derivation.
fn voronoiF1F2(p: vec2<f32>, jitter: f32, seedVal: f32) -> vec2<f32> {
    let g = floor(p);
    let f = p - g;
    var best = 1e9;
    var second = 1e9;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let cell = vec2<f32>(f32(x), f32(y));
            let pt = cell + 0.5 + (hash22(g + cell + seedVal * 101.7) - 0.5) * jitter;
            let d = dot(pt - f, pt - f);
            if (d < best) {
                second = best;
                best = d;
            } else if (d < second) {
                second = d;
            }
        }
    }
    return vec2<f32>(sqrt(best), sqrt(second));
}

// Directional relief shading from height.
fn reliefShade(hC: f32, hR: f32, hT: f32, strength: f32, lightAngleDeg: f32) -> f32 {
    let grad = vec2<f32>(hR - hC, hT - hC) * strength;
    let n = normalize(vec3<f32>(-grad, 1.0));
    let a = radians(lightAngleDeg);
    let L = normalize(vec3<f32>(cos(a), sin(a), 0.75));
    return clamp(dot(n, L), 0.0, 1.0);
}

// Crack mask k at global pixel position gc: 1 on a cell border, falling
// to 0 within `edge` px (see craquelure.glsl's file header).
fn crackMask(gc: vec2<f32>, spacingPx: f32, depthPct: f32, seedVal: f32) -> f32 {
    let wob = vec2<f32>(vnoise(gc / 6.0), vnoise(gc / 6.0 + vec2<f32>(37.7, 91.3))) * 2.0;
    let p = (gc + wob) / spacingPx;
    let f1f2 = voronoiF1F2(p, 1.0, seedVal);
    let d = (f1f2.y - f1f2.x) * spacingPx;
    let edge = 1.5 + depthPct / 100.0 * 2.0;
    return 1.0 - smoothstep(0.0, edge, d);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let seedF = f32(uniforms.seed);

    let kC = crackMask(globalCoord, uniforms.spacing, uniforms.depth, seedF);
    let kR = crackMask(globalCoord + vec2<f32>(1.0, 0.0), uniforms.spacing, uniforms.depth, seedF);
    let kL = crackMask(globalCoord - vec2<f32>(1.0, 0.0), uniforms.spacing, uniforms.depth, seedF);
    let kT = crackMask(globalCoord + vec2<f32>(0.0, 1.0), uniforms.spacing, uniforms.depth, seedF);
    let kB = crackMask(globalCoord - vec2<f32>(0.0, 1.0), uniforms.spacing, uniforms.depth, seedF);

    // Central-difference gradient of k; feeds both reliefShade's synthetic
    // height samples below and wallMask's locality gate.
    let gradK = vec2<f32>((kR - kL) * 0.5, (kT - kB) * 0.5);

    // Height fed to reliefShade is -k: a crack is a carved groove (a dip),
    // not a raised ridge - see craquelure.glsl for the full derivation.
    let hC = -kC;
    let hR = hC - gradK.x;
    let hT = hC - gradK.y;
    let shadeStrength = 6.0;
    let shade = reliefShade(hC, hR, hT, shadeStrength, 135.0);

    // reliefShade's flat-gradient baseline is 0.6, not 0.5 - recenter on
    // it, and gate by wallMask so flat ground gets EXACTLY shadeMul ==
    // 1.0 (gradK saturates to exactly 0 away from any crack).
    let gradMagK = length(gradK);
    let wallMask = smoothstep(0.0, 0.02, gradMagK);
    let shadeMul = 1.0 + (shade - 0.6) * 2.0 * (0.25 * uniforms.depth / 100.0) * wallMask;

    let darkened = src.rgb * mix(1.0, 0.35 + uniforms.brightness / 100.0 * 0.5, kC);
    let result = clamp(darkened * shadeMul, vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(result, src.a);
}
