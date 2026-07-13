/*
 * Mosaic Tiles - covers two filters via `mode`. See
 * mosaicTiles.glsl for the full algorithm derivation (wavy-grid warp,
 * grout/gap mask construction, groutWidth's dual reuse, seed's warp
 * mixing, the constant per-tile representative sample, relief shading bevel
 * shading with the flat-shade-0.6 centering correction); this is a 1:1
 * port.
 *
 * tileOffset converts the tile-local fragment position to global procedural
 * coordinates, and converts representative global source positions back to
 * the local input texture. It is zero for ordinary full-frame renders.
 *
 * No rotation/handedness question anywhere in this effect (no angle
 * param, no swirl) - every vector here is axis-aligned grid math
 * (floor/fract/min/mix) or a scalar broadcast, and reliefShade's light
 * vector L is a plain function of the fixed 135-degree angle constant,
 * not fragment-coordinate-derived, so it is textually identical to the
 * GLSL. The 4 neighbor taps used for the grout-mask central
 * difference (gc +/- 1px on each axis) use the SAME textual +1/-1 offsets
 * on WGSL's own native pos.xy, uncompensated - the WebGPU present-time
 * flip cancels the raw Y-convention difference for position-derived
 * offsets like these;
 * filter/spinBlur, filter/pondRipples precedent).
 *
 * MODE is a compile-time const injected by the runtime via injectDefines
 * (see definition.js `globals.mode.define`). Same fix as the GLSL
 * backend - collapses the 2-way mode dispatch so it constant-folds
 * instead of branching on a runtime uniform. The old `mode` field is
 * removed from Uniforms; the packer maps the remaining fields by name to
 * recomputed byte offsets, so removal is safe.
 */

struct Uniforms {
    tileSize: f32,
    groutWidth: f32,
    relief: f32,
    maxOffset: f32,
    gapFill: i32,
    backgroundColor: vec3<f32>,
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

// Directional relief shading from height.
fn reliefShade(hC: f32, hR: f32, hT: f32, strength: f32, lightAngleDeg: f32) -> f32 {
    let grad = vec2<f32>(hR - hC, hT - hC) * strength;
    let n = normalize(vec3<f32>(-grad, 1.0));
    let a = radians(lightAngleDeg);
    let L = normalize(vec3<f32>(cos(a), sin(a), 0.75));
    return clamp(dot(n, L), 0.0, 1.0);
}

// See mosaicTiles.glsl's mosaicWarp for the full derivation.
fn mosaicWarp(gc: vec2<f32>, tileSizePx: f32, seedVal: f32) -> f32 {
    return vnoise(gc / tileSizePx + seedVal * 101.7) * 0.25 * tileSizePx;
}

// See mosaicTiles.glsl's mosaicGroutMask for the full derivation.
fn mosaicGroutMask(gc: vec2<f32>, tileSizePx: f32, groutWidthPct: f32, seedVal: f32) -> f32 {
    let warp = mosaicWarp(gc, tileSizePx, seedVal);
    let cellFrac = fract((gc + vec2<f32>(warp)) / tileSizePx);
    let edgeDistPx = min(min(cellFrac.x, 1.0 - cellFrac.x), min(cellFrac.y, 1.0 - cellFrac.y)) * tileSizePx;
    let groutHalfWidthPx = groutWidthPct / 100.0 * (tileSizePx * 0.5);
    let groutAA = 1.25;
    return 1.0 - smoothstep(groutHalfWidthPx - groutAA, groutHalfWidthPx + groutAA, edgeDistPx);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = pos.xy / texSize;
    let srcHome = textureSample(inputTex, inputSampler, uv);
    let seedF = f32(uniforms.seed);

    var result: vec3<f32>;

    if (MODE == 0) {
        // Mosaic: wavy tiles with beveled grout.
        let warp = mosaicWarp(globalCoord, uniforms.tileSize, seedF);
        let warpedCoord = globalCoord + vec2<f32>(warp);
        let cellSpace = warpedCoord / uniforms.tileSize;
        let cellId = floor(cellSpace);
        let warpedCenter = (cellId + vec2<f32>(0.5)) * uniforms.tileSize;
        let centerWarp = mosaicWarp(warpedCenter, uniforms.tileSize, seedF);
        let sampleGc = warpedCenter - vec2<f32>(centerWarp);
        let sampleUV = clamp((sampleGc - uniforms.tileOffset) / texSize,
            vec2<f32>(0.0), vec2<f32>(1.0));
        let tileColor = textureSample(inputTex, inputSampler, sampleUV).rgb;

        // True central-difference gradient of the grout mask (5 bounded
        // evaluations total), fed into filter/relief's reliefShade exactly like
        // filter/craquelure's crack wall shading.
        let kC = mosaicGroutMask(globalCoord, uniforms.tileSize, uniforms.groutWidth, seedF);
        let kR = mosaicGroutMask(globalCoord + vec2<f32>(1.0, 0.0), uniforms.tileSize, uniforms.groutWidth, seedF);
        let kL = mosaicGroutMask(globalCoord - vec2<f32>(1.0, 0.0), uniforms.tileSize, uniforms.groutWidth, seedF);
        let kT = mosaicGroutMask(globalCoord + vec2<f32>(0.0, 1.0), uniforms.tileSize, uniforms.groutWidth, seedF);
        let kB = mosaicGroutMask(globalCoord - vec2<f32>(0.0, 1.0), uniforms.tileSize, uniforms.groutWidth, seedF);

        // Central-difference gradient of the grout mask k; feeds
        // reliefShade's synthetic height samples below.
        let gradK = vec2<f32>((kR - kL) * 0.5, (kT - kB) * 0.5);

        // Height fed to reliefShade is -k, NOT +k: grout is a carved
        // groove (a dip), not a raised ridge - see mosaicTiles.glsl for
        // the full derivation (mirrors filter/craquelure's 83a0731c fix).
        let hC = -kC;
        let hR = hC - gradK.x;
        let hT = hC - gradK.y;
        let shadeStrength = 6.0;
        let shade = reliefShade(hC, hR, hT, shadeStrength, 135.0);

        // See mosaicTiles.glsl: 0.6 is reliefShade's angle-independent
        // flat-ground value, so centering the bevel multiplier there
        // makes relief contribute exactly zero shading away from grout.
        // Unlike craquelure's wallMask, no additional gradient gate is
        // needed: k already saturates to an exact flat plateau away from
        // any grout band, so gradK is already exactly zero there.
        let flatShade = 0.6;
        let darkened = tileColor * mix(1.0, 0.35, kC);
        let shadeMul = 1.0 + (shade - flatShade) * 2.0 * (uniforms.relief / 100.0);
        result = clamp(darkened * shadeMul, vec3<f32>(0.0), vec3<f32>(1.0));
    } else {
        // Shifted: regular pixelized tiles, each assigned one representative
        // color from a randomly shifted source position, with a small fixed
        // gap between tiles filled per gapFill.
        let cellSpace = globalCoord / uniforms.tileSize;
        let cellId = floor(cellSpace);
        let cellFrac = fract(cellSpace);
        let edgeDistPx = min(min(cellFrac.x, 1.0 - cellFrac.x), min(cellFrac.y, 1.0 - cellFrac.y)) * uniforms.tileSize;

        let gapWidthPx = uniforms.groutWidth / 100.0 * uniforms.tileSize;
        let gapAA = 1.25;
        let gapMask = 1.0 - smoothstep(gapWidthPx * 0.5 - gapAA, gapWidthPx * 0.5 + gapAA, edgeDistPx);

        // x2.0 expands the hash's +/-0.5 span to +/-1.0 so offsetPx spans
        // the full +/-maxOffset% of tileSize.
        let offsetPx = (hash22(cellId + seedF * 101.7) - 0.5) * 2.0 * (uniforms.maxOffset / 100.0) * uniforms.tileSize;
        let cellCenterGc = (cellId + vec2<f32>(0.5)) * uniforms.tileSize;
        let shiftedGc = cellCenterGc + offsetPx;
        let shiftedUV = clamp((shiftedGc - uniforms.tileOffset) / texSize,
            vec2<f32>(0.0), vec2<f32>(1.0));
        let tileColor = textureSample(inputTex, inputSampler, shiftedUV).rgb;

        var gapColor: vec3<f32>;
        if (uniforms.gapFill == 0) {
            // background
            gapColor = uniforms.backgroundColor;
        } else if (uniforms.gapFill == 1) {
            // inverse of the tile's own home pixel
            gapColor = 1.0 - srcHome.rgb;
        } else {
            // unaltered home pixel
            gapColor = srcHome.rgb;
        }

        result = mix(tileColor, gapColor, gapMask);
    }

    // Alpha always comes from the pixel's own unmodified home position,
    // matching filter/stipple's precedent - true in the gapFill/unaltered
    // path too, since it already samples srcHome for its color.
    return vec4<f32>(result, srcHome.a);
}
