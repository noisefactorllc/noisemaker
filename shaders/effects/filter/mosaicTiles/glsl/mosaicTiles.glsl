/*
 * Mosaic Tiles - covers two filters via `mode`:
 *
 *   mosaic (0)  - A square grid warped by value noise into wavy ceramic
 *                 tiles. Each tile pixelizes its image region to one
 *                 representative source sample (see the mosaic branch
 *                 below), and tiles
 *                 are separated by grout that is darkened and beveled
 *                 with relief shading directional relief shading (fixed 135-degree
 *                 light, matching filter/craquelure's convention).
 *   shifted (1) - A REGULAR (unwarped) square grid;
 *                 each tile is pixelized to one representative color from
 *                 a randomly shifted source position (a per-cell hash
 *                 offset, up to maxOffset% of a tile width), leaving a small
 *                 fixed gap between tiles that is filled per `gapFill`
 *                 (backgroundColor / the inverse of the tile's own home
 *                 pixel / the unaltered home pixel).
 *
 * Both modes assign pixels to cells with the same floor/fract grid math
 * on tileSize-sized cells, in GLOBAL (tile-aware) pixel coordinates so
 * the grid and its warp are continuous across CLI render tiles. `mode`
 * is a compile-time `define` (MODE, see definition.js's
 * `globals.mode.define`): the two branches are fully distinct algorithms,
 * so baking MODE lets the compiler drop the dead arm instead of branching
 * at runtime on a value that is constant for the whole draw.
 *
 * groutWidth is a single shared uniform reused by BOTH modes for visual
 * consistency, rather than adding a second "gap width" param: in mosaic
 * it sets the grout band's HALF-width (groutWidth% of tileSize/2,
 * measured from the warped cell border - see mosaicGroutMask below); in
 * shifted it sets the FULL fixed inter-tile gap width (groutWidth% of
 * tileSize - no /2, since it is a gap between two tile faces rather than
 * a border-hugging band, and using the full tileSize keeps the default
 * (12%) gap appropriately small and subtle; referencing tileSize/2 would make
 * the default gap barely a pixel wide). Its UI control (definition.js)
 * is gated to mosaic-only: shifted's gap is meant to read as a small
 * fixed structural constant rather than a per-mode headline control, but
 * the shader still consumes whatever value the uniform currently holds
 * in BOTH branches, so a user who wants a different shifted gap width
 * can dial it in from mosaic mode's grout slider before switching modes.
 *
 * seed is mixed into the mosaic warp's vnoise lookup position (via the
 * same `seedVal * 101.7` large-offset-translation idiom filter/stipple
 * and filter/craquelure use for their hash lookups). This keeps `seed`
 * responsive in mosaic mode as well as shifted mode and matches the
 * equivalent seeded procedural fields in filter/stipple.
 */

#ifdef GL_ES
precision highp float;
#endif

// MODE is a compile-time define injected by the runtime (see definition.js
// `globals.mode.define`). Wrapping the 2-way variant dispatch in #if blocks
// instead of a runtime int dispatch lets the compiler drop the unreachable
// mode arm instead of keeping both fully distinct algorithms live.
#ifndef MODE
#define MODE 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float tileSize;
uniform float groutWidth;
uniform float relief;
uniform float maxOffset;
uniform int gapFill;
uniform vec3 backgroundColor;
uniform int seed;

out vec4 fragColor;

// hash - hash / jitter.
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// value noise - value noise (fBm not needed here).
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Directional relief shading from height.
float reliefShade(float hC, float hR, float hT, float strength, float lightAngleDeg) {
    vec2 grad = vec2(hR - hC, hT - hC) * strength;
    vec3 n = normalize(vec3(-grad, 1.0));
    float a = radians(lightAngleDeg);
    vec3 L = normalize(vec3(cos(a), sin(a), 0.75));
    return clamp(dot(n, L), 0.0, 1.0);
}

// Mosaic mode's wavy-grid warp scalar (px) at global pixel position gc,
// broadcast equally to both axes when added to gc (see main()'s mosaic
// branch) - a single continuous scalar field is enough to wave every
// cell border, because two neighboring pixels straddling a nominal
// border pick up slightly different offsets as the noise varies, which
// bends the actual floor()-quantized cell boundary between them (the
// same domain-warp-before-quantize mechanism filter/craquelure uses for
// its crack path, there applied identically to both axes for the same
// reason - see craquelure.glsl's header).
float mosaicWarp(vec2 gc, float tileSizePx, float seedVal) {
    return vnoise(gc / tileSizePx + seedVal * 101.7) * 0.25 * tileSizePx;
}

// Mosaic mode's grout mask (1 = on grout, 0 = tile interior) at global
// pixel position gc: warps gc, finds the fractional position within its
// tileSizePx cell, and turns the distance to the nearest cell edge into
// an antialiased band of half-width `groutWidthPct% of tileSizePx/2`.
float mosaicGroutMask(vec2 gc, float tileSizePx, float groutWidthPct, float seedVal) {
    float warp = mosaicWarp(gc, tileSizePx, seedVal);
    vec2 cellFrac = fract((gc + vec2(warp)) / tileSizePx);
    float edgeDistPx = min(min(cellFrac.x, 1.0 - cellFrac.x), min(cellFrac.y, 1.0 - cellFrac.y)) * tileSizePx;
    float groutHalfWidthPx = groutWidthPct / 100.0 * (tileSizePx * 0.5);
    float groutAA = 1.25;
    return 1.0 - smoothstep(groutHalfWidthPx - groutAA, groutHalfWidthPx + groutAA, edgeDistPx);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 srcHome = texture(inputTex, uv);
    float seedF = float(seed);

    vec3 result;

#if MODE==0
    // Mosaic: wavy tiles with beveled grout.
    float warp = mosaicWarp(globalCoord, tileSize, seedF);
    vec2 warpedCoord = globalCoord + vec2(warp);
    vec2 cellSpace = warpedCoord / tileSize;
    vec2 cellId = floor(cellSpace);
    // Pixelize the source: every fragment assigned to this warped tile
    // samples one representative coordinate. Evaluate the inverse-warp
    // approximation at the cell center (not at the current fragment), so
    // the sample stays constant across the entire tile interior.
    vec2 warpedCenter = (cellId + vec2(0.5)) * tileSize;
    float centerWarp = mosaicWarp(warpedCenter, tileSize, seedF);
    vec2 sampleGc = warpedCenter - vec2(centerWarp);
    vec2 sampleUV = clamp((sampleGc - tileOffset) / resolution, 0.0, 1.0);
    vec3 tileColor = texture(inputTex, sampleUV).rgb;

    // True central-difference gradient of the grout mask (5 bounded
    // evaluations total), fed into filter/relief's reliefShade exactly like
    // filter/craquelure's crack wall shading.
    float kC = mosaicGroutMask(globalCoord, tileSize, groutWidth, seedF);
    float kR = mosaicGroutMask(globalCoord + vec2(1.0, 0.0), tileSize, groutWidth, seedF);
    float kL = mosaicGroutMask(globalCoord - vec2(1.0, 0.0), tileSize, groutWidth, seedF);
    float kT = mosaicGroutMask(globalCoord + vec2(0.0, 1.0), tileSize, groutWidth, seedF);
    float kB = mosaicGroutMask(globalCoord - vec2(0.0, 1.0), tileSize, groutWidth, seedF);

    // Central-difference gradient of the grout mask k; feeds
    // reliefShade's synthetic height samples below.
    vec2 gradK = vec2((kR - kL) * 0.5, (kT - kB) * 0.5);

    // Height fed to reliefShade is -k, NOT +k: grout is a carved
    // groove (a dip), not a raised ridge, so height must FALL toward
    // the grout center. Negating hC/hR/hT flips the sign of the
    // gradient/normal reliefShade sees, which puts the lit wall on
    // the correct (concave-groove) side of the grout - mirrors
    // filter/craquelure's crack-wall fix, see its 83a0731c commit
    // for the full derivation.
    float hC = -kC;
    float hR = hC - gradK.x;
    float hT = hC - gradK.y;
    float shadeStrength = 6.0;
    float shade = reliefShade(hC, hR, hT, shadeStrength, 135.0);

    // reliefShade's flat-ground (zero-gradient) value is exactly 0.6
    // for ANY lightAngleDeg (L's z-component is a fixed 0.75 before
    // normalizing by a length that always works out to 1.25
    // regardless of angle, since cos^2+sin^2=1), so centering the
    // bevel multiplier there - rather than filter/craquelure's
    // literal 0.5 - makes relief contribute EXACTLY zero shading
    // away from any grout, not just at relief=0 (a small correctness
    // improvement; craquelure's 0.5 centering leaves a faint uniform
    // tint across its whole image that this avoids). Unlike
    // craquelure's wallMask, no additional gradient gate is needed
    // here: the grout mask k already saturates to an exact flat
    // plateau (0) away from any grout band by construction
    // (mosaicGroutMask's smoothstep has a clamped range), so gradK -
    // and therefore shade's departure from flatShade - is already
    // exactly zero there.
    float flatShade = 0.6;
    vec3 darkened = tileColor * mix(1.0, 0.35, kC);
    float shadeMul = 1.0 + (shade - flatShade) * 2.0 * (relief / 100.0);
    result = clamp(darkened * shadeMul, 0.0, 1.0);
#elif MODE==1
    // Shifted: regular pixelized tiles, each assigned one representative
    // color from a randomly shifted source position, with a small fixed
    // gap between tiles filled per gapFill.
    vec2 cellSpace = globalCoord / tileSize;
    vec2 cellId = floor(cellSpace);
    vec2 cellFrac = fract(cellSpace);
    float edgeDistPx = min(min(cellFrac.x, 1.0 - cellFrac.x), min(cellFrac.y, 1.0 - cellFrac.y)) * tileSize;

    float gapWidthPx = groutWidth / 100.0 * tileSize;
    float gapAA = 1.25;
    float gapMask = 1.0 - smoothstep(gapWidthPx * 0.5 - gapAA, gapWidthPx * 0.5 + gapAA, edgeDistPx);

    // x2.0 expands the hash's +/-0.5 span to +/-1.0 so offsetPx spans
    // the full +/-maxOffset% of tileSize.
    vec2 offsetPx = (hash22(cellId + seedF * 101.7) - 0.5) * 2.0 * (maxOffset / 100.0) * tileSize;
    vec2 cellCenterGc = (cellId + vec2(0.5)) * tileSize;
    vec2 shiftedGc = cellCenterGc + offsetPx;
    vec2 shiftedUV = clamp((shiftedGc - tileOffset) / resolution, 0.0, 1.0);
    vec3 tileColor = texture(inputTex, shiftedUV).rgb;

    vec3 gapColor;
    if (gapFill == 0) {
        // background
        gapColor = backgroundColor;
    } else if (gapFill == 1) {
        // inverse of the tile's own home pixel
        gapColor = 1.0 - srcHome.rgb;
    } else {
        // unaltered home pixel
        gapColor = srcHome.rgb;
    }

    result = mix(tileColor, gapColor, gapMask);
#endif

    // Alpha always comes from the pixel's own unmodified home position,
    // matching filter/stipple's precedent - true in the gapFill/unaltered
    // path too, since it already samples srcHome for its color.
    fragColor = vec4(result, srcHome.a);
}
