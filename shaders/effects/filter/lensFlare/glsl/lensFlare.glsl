/*
 * Lens Flare - classic additive lens flare (Filter > Render >
 * Lens Flare). Every element is positioned along the flare axis
 * A(t) = mix(flarePos, mirrorPos, t), where flarePos = (centerX,
 * centerY) is the user-placed flare position and mirrorPos = 1 -
 * flarePos is flarePos reflected across the fixed image center (0.5,
 * 0.5). t=0 sits on the flare itself; t=1 sits on the mirrored point on
 * the far side of the image center - the classic "ghosts marching
 * toward the opposite corner" chain. All distances are measured in
 * aspect-corrected UV space (x scaled by fullResolution.x/y, exactly
 * like filter/pinch and filter/spinBlur's own distortion math) so
 * circular/hexagonal elements stay round/regular instead of stretching
 * with the image aspect ratio.
 *
 * This effect never resamples inputTex at a displaced position - it
 * only ADDS energy on top of each pixel's own color - so there is no
 * wrap mode and no antialiasing pass; the source is sampled once at the
 * fragment's own (tile-local) UV. The flare geometry itself is driven
 * by the tile-aware GLOBAL UV (globalCoord/fullResolution) so the
 * flare reads as one continuous pattern across CLI render tiles, per
 * the tile-aware pattern used by pondRipples/extrude/mosaicTiles.
 *
 * centerX/centerY are used directly, with no 1.0-centerY flip:
 * position-derived vectors (flarePos here) flip along with the
 * framebuffer, and the WebGPU present-path flip cancels the raw
 * convention difference, so both backends land the flare in the same
 * screen position when both write centerY unflipped.
 *
 * Every shape primitive used below (core glow, streak, star, hex mask,
 * circle/ring ghosts, halo band) is built from squared distances,
 * cos(6*phi), or a 3-axis abs(dot(...)) max - all even/mirror-symmetric
 * under a Y flip - so the only orientation-sensitive quantity in this
 * whole effect is flarePos itself.
 */

#ifdef GL_ES
precision highp float;
#endif

// LENS_TYPE is a compile-time define injected by the runtime (see
// definition.js `globals.lensType.define`). Each lens type selects a fully
// distinct ghost-chain table (6/4/3 elements); baking LENS_TYPE lets the
// compiler strip the other tables' dead branches instead of evaluating
// every ghost for every pixel.
#ifndef LENS_TYPE
#define LENS_TYPE 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float brightness;
uniform float centerX;
uniform float centerY;
uniform vec3 tint;

out vec4 fragColor;

#define TAU 6.28318530717958647692

// Aspect-corrected point at parameter t along the flare axis.
vec2 flareAxis(vec2 flarePos, vec2 mirrorPos, float t, float aspectRatio) {
    vec2 a = mix(flarePos, mirrorPos, t);
    a.x *= aspectRatio;
    return a;
}

// Bright core: a tight Gaussian spike plus a wider soft glow skirt.
float coreGlow(float d) {
    return exp(-d * d * 900.0) * 1.2 + exp(-d * 8.0) * 0.4;
}

// Anamorphic streak: very tight vertically (dy weighted 4000x), long
// horizontally (dx weighted 18x) - the thin horizontal line real
// anamorphic lenses throw through a bright source.
float anamorphicStreak(vec2 delta) {
    return exp(-(delta.y * delta.y * 4000.0 + delta.x * delta.x * 18.0));
}

// 6-point star: cos(6*phi) is maximized every 60 degrees around the
// flare, raised to a high power to spike into narrow points, faded
// radially so it only reads near the core.
float sixPointStar(vec2 delta, float d) {
    float phi = atan(delta.y, delta.x);
    return pow(max(0.0, cos(6.0 * phi)), 40.0) * exp(-d * 5.0) * 0.5;
}

// Simple 3-phase cosine palette for the halo's rainbow tint: each RGB
// channel is a cosine of the halo radius dc with phases spaced 1/3 turn
// apart (0, 1/3, 2/3), producing a smooth hue sweep driven by radius
// alone (a compact stand-in for the chromatic fringing real halo rings
// show) without a full HSV round-trip.
vec3 haloRainbow(float dc) {
    return 0.5 + 0.5 * cos(TAU * (dc * 10.0 + vec3(0.0, 0.3333333, 0.6666667)));
}

// Halo ring: a narrow band centered at radius 0.28 around the mirrored
// point (t=1.0), matching the ring that hugs the image-center
// region opposite the flare.
float haloBand(float dc) {
    return exp(-abs(dc - 0.28) * 60.0) * 0.25;
}

// Filled-disc ghost with a soft edge. The edge order is deliberately
// reversed (edge0=size is farther out than edge1=size*0.6): dist=0 then
// reads past edge1 so smoothstep clamps to 1 (full intensity at the
// ghost center), dist=size reads at edge0 so it clamps to 0 (faded out
// by the ghost's nominal radius), with a soft ramp between. GLSL and
// WGSL both implement smoothstep via the same clamp+Hermite polynomial
// regardless of which edge is larger, so this matches bit-for-bit
// across backends.
float circleGhost(float dist, float size) {
    return (1.0 - smoothstep(size * 0.6, size, dist));
}

// Same idiom as circleGhost but with a wider falloff band, used for
// prime105's large "soft circle" ghosts.
float softCircleGhost(float dist, float size) {
    return (1.0 - smoothstep(size * 0.3, size, dist));
}

// Hollow ring ghost: an outer soft disc minus a smaller inner soft
// disc, both built from the same reversed-smoothstep idiom - leaves a
// bright band around radius ~0.6*size and nothing at the center.
float ringGhost(float dist, float size) {
    float outer = (1.0 - smoothstep(size * 0.6, size, dist));
    float inner = (1.0 - smoothstep(size * 0.3, size * 0.6, dist));
    return outer - inner;
}

// Regular-hexagon "distance": max of abs(dot(p, axis)) over 3 axes 60
// degrees apart. Thresholding this with the same reversed-smoothstep
// idiom as circleGhost gives a soft-edged hexagon instead of a disc.
// (This norm is symmetric under a Y flip: reflecting p about the
// horizontal axis permutes the 3-axis set {0, 60, 120} degrees onto
// itself, and max() over a permuted set is unchanged.)
float hexDist(vec2 p) {
    vec2 a0 = vec2(1.0, 0.0);
    vec2 a1 = vec2(0.5, 0.8660254038);
    vec2 a2 = vec2(-0.5, 0.8660254038);
    float d0 = abs(dot(p, a0));
    float d1 = abs(dot(p, a1));
    float d2 = abs(dot(p, a2));
    return max(d0, max(d1, d2));
}

float hexGhost(vec2 delta, float size) {
    return (1.0 - smoothstep(size * 0.6, size, hexDist(delta)));
}

void main() {
    float aspectRatio = fullResolution.x / fullResolution.y;
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;
    vec2 localUV = gl_FragCoord.xy / resolution;

    vec4 src = texture(inputTex, localUV);

    vec2 flarePos = vec2(centerX, centerY);
    vec2 mirrorPos = vec2(1.0) - flarePos;

    vec2 p = uv;
    p.x *= aspectRatio;

    vec2 aFlare = flareAxis(flarePos, mirrorPos, 0.0, aspectRatio);
    vec2 delta0 = p - aFlare;
    float d0 = length(delta0);

    vec3 flare = vec3(0.0);

    // Core glow (all lens types).
    flare += vec3(coreGlow(d0));

    // Anamorphic streak (all lens types; doubled for moviePrime).
    float streakVal = anamorphicStreak(delta0);
    #if LENS_TYPE==3
    streakVal *= 2.0;
    #endif
    flare += vec3(streakVal);

    // 6-point star: zoom50_300 and moviePrime only.
    #if LENS_TYPE==0 || LENS_TYPE==3
    flare += vec3(sixPointStar(delta0, d0));
    #endif

    // Rainbow halo ring at t=1.0 (all lens types).
    vec2 aMirror = flareAxis(flarePos, mirrorPos, 1.0, aspectRatio);
    float dc = length(p - aMirror);
    flare += haloRainbow(dc) * haloBand(dc);

    // Ghost chain: table selected by lensType.
    vec2 g = vec2(0.0);
    #if LENS_TYPE==0 || LENS_TYPE==3
        // zoom50_300 (also the base table for moviePrime): 6 ghosts,
        // the largest (t=1.55) rendered hollow for classic-look variety.
        g = flareAxis(flarePos, mirrorPos, 0.25, aspectRatio);
        flare += vec3(1.00, 0.85, 0.60) * circleGhost(length(p - g), 0.06) * 0.35;

        g = flareAxis(flarePos, mirrorPos, 0.4, aspectRatio);
        flare += vec3(0.40, 0.90, 0.85) * circleGhost(length(p - g), 0.10) * 0.25;

        g = flareAxis(flarePos, mirrorPos, 0.6, aspectRatio);
        flare += vec3(0.65, 0.40, 0.95) * circleGhost(length(p - g), 0.045) * 0.45;

        g = flareAxis(flarePos, mirrorPos, 0.85, aspectRatio);
        flare += vec3(0.45, 0.90, 0.50) * circleGhost(length(p - g), 0.14) * 0.18;

        g = flareAxis(flarePos, mirrorPos, 1.2, aspectRatio);
        flare += vec3(1.00, 0.55, 0.20) * circleGhost(length(p - g), 0.08) * 0.30;

        g = flareAxis(flarePos, mirrorPos, 1.55, aspectRatio);
        flare += vec3(0.40, 0.55, 1.00) * ringGhost(length(p - g), 0.20) * 0.12;
    #elif LENS_TYPE==1
        // prime35: 4 tight hexagon ghosts.
        g = flareAxis(flarePos, mirrorPos, 0.3, aspectRatio);
        flare += vec3(1.00, 0.80, 0.55) * hexGhost(p - g, 0.04) * 0.35;

        g = flareAxis(flarePos, mirrorPos, 0.55, aspectRatio);
        flare += vec3(0.85, 0.85, 0.92) * hexGhost(p - g, 0.055) * 0.30;

        g = flareAxis(flarePos, mirrorPos, 0.8, aspectRatio);
        flare += vec3(0.95, 0.70, 0.50) * hexGhost(p - g, 0.065) * 0.25;

        g = flareAxis(flarePos, mirrorPos, 1.3, aspectRatio);
        flare += vec3(0.80, 0.85, 0.95) * hexGhost(p - g, 0.08) * 0.20;
    #else
        // prime105: 3 large soft circles.
        g = flareAxis(flarePos, mirrorPos, 0.45, aspectRatio);
        flare += vec3(0.92, 0.85, 0.78) * softCircleGhost(length(p - g), 0.12) * 0.25;

        g = flareAxis(flarePos, mirrorPos, 0.9, aspectRatio);
        flare += vec3(0.85, 0.88, 0.95) * softCircleGhost(length(p - g), 0.16) * 0.20;

        g = flareAxis(flarePos, mirrorPos, 1.5, aspectRatio);
        flare += vec3(0.95, 0.88, 0.80) * softCircleGhost(length(p - g), 0.20) * 0.15;
    #endif

    vec3 outFlare = flare * tint * (brightness / 100.0);
    #if LENS_TYPE==3
    // moviePrime: cooler overall tint multiplier on top of the
    // user's tint.
    outFlare *= vec3(0.9, 0.95, 1.1);
    #endif

    fragColor = vec4(clamp(src.rgb + outFlare, 0.0, 1.0), src.a);
}
