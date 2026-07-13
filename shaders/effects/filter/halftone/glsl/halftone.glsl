/*
 * Halftone - rotated subtractive color screens and monochrome patterns.
 *
 * Screen geometry: global (tile-aware) pixel coordinates are rotated by
 * the screen's angle and tiled into `frequency`-px cells; a fragment's
 * distance to the cell's ink feature (dot center / line midline / ring
 * band) drives an antialiased coverage value via smoothstep against
 * fwidth(), so the screen stays crisp at any resolution.
 *
 * mode == 0 (color): separates RGB into CMYK with under-color removal,
 * then drives four independent screens at the user-facing channel
 * angles. Each screen's dot SIZE comes from that ink's amount, sampled
 * with a light 3x3 box blur at the CENTER of the current fragment's
 * screen cell (not the fragment itself) so a cell's dot has one flat
 * size - the posterized "true halftone" look - rather than wobbling with
 * in-cell image detail. The screened inks composite subtractively back
 * to RGB. Neutral RGB separates to K only and therefore stays neutral.
 *
 * mode == 1 (mono): drives a single screen from image luminance. The
 * `pattern` dropdown selects the spot function: dot (radial distance
 * within the rotated cell), line (distance to the cell's rotated
 * midline - parallel engraving-style lines along the screen angle), or
 * circle (concentric rings measured from the image center, unrotated).
 * dot/line reuse the same cell-center sampling as color mode; circle has
 * no natural grid cell to center on, so it uses a mild local blur at the
 * fragment itself. Output is tonemapped between `paperColor` (no ink)
 * and `inkColor` (full ink).
 *
 * All cell math uses GLSL's `fract`, which is already floor-based
 * (`fract(x) = x - floor(x)`) and therefore safe for the negative
 * coordinates a rotated screen produces off-origin - no manual
 * floored-mod needed.
 */

#ifdef GL_ES
precision highp float;
#endif

// MODE and PATTERN are compile-time defines injected by the runtime (see
// definition.js `globals.mode.define` / `globals.pattern.define`). Baking
// them lets the compiler drop the unselected mode/pattern arms instead of
// carrying a runtime int dispatch through every fragment.
#ifndef MODE
#define MODE 0
#endif

#ifndef PATTERN
#define PATTERN 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float frequency;
uniform float cyanAngle;
uniform float magentaAngle;
uniform float yellowAngle;
uniform float blackAngle;
uniform float monoAngle;
uniform float sharpness;
uniform vec3 inkColor;
uniform vec3 paperColor;

out vec4 fragColor;

float lum(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 tonemap2(float t, vec3 ink, vec3 paper) {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

// Standard CMYK separation with full under-color removal. The shared
// neutral component becomes K, leaving C/M/Y at zero for neutral RGB.
vec4 rgbToCmyk(vec3 rgb) {
    float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
    float scale = max(1.0 - k, 0.00001);
    vec3 cmy = clamp((1.0 - rgb - vec3(k)) / scale, 0.0, 1.0);
    return vec4(cmy, k);
}

// Rotates a position-derived (global pixel space) vector by angleDeg.
// GLSL uses this mat2(c,-s,s,c) form for position-derived geometry with
// no manual Y compensation. Because this matrix is
// orthonormal, calling it with -angleDeg gives the exact inverse
// rotation (its transpose), which cellSampleFromRuv relies on below.
vec2 rotate2D(vec2 v, float angleDeg) {
    float a = radians(angleDeg);
    float co = cos(a);
    float si = sin(a);
    return mat2(co, -si, si, co) * v;
}

vec3 boxBlur3(vec2 uv, vec2 texel) {
    vec3 sum = vec3(0.0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y)) * texel;
            sum += texture(inputTex, clamp(uv + o, 0.0, 1.0)).rgb;
        }
    }
    return sum / 9.0;
}

// Blurred RGB sampled at the center of the rotated screen cell whose
// already-rotated-and-scaled coordinate is `ruv` (= rotate2D(gc,
// angleDeg) / frequency). Sampling the cell CENTER instead of the
// current fragment gives every dot in the cell one flat size - see file
// header.
vec3 cellSampleFromRuv(vec2 ruv, float angleDeg, vec2 texel) {
    vec2 cellId = floor(ruv) + 0.5;
    vec2 cellCenterGc = rotate2D(cellId * frequency, -angleDeg);
    vec2 cellUV = clamp((cellCenterGc - tileOffset) / resolution, 0.0, 1.0);
    return boxBlur3(cellUV, texel);
}

// Antialiased ink coverage (1 = full ink, 0 = bare paper) for a spot
// whose size is set by `value` (0..1, larger = more ink) at normalized
// distance `d` from the spot's feature. `sharpnessPct` is the user-facing
// 0-100 uniform; higher values narrow the antialiased transition for
// crisper edges (internally this is "1 - sharpness" worth of softness,
// mixing a wide constant fallback with the fwidth-derived crisp width).
float halftoneCoverage(float d, float value, float sharpnessPct) {
    float spot = sqrt(clamp(value, 0.0, 1.0)) * 0.7071;
    float softness = 1.0 - clamp(sharpnessPct / 100.0, 0.0, 1.0);
    float aa = max(mix(fwidth(d) * 1.5, 0.35, softness), 0.00001);
    return 1.0 - smoothstep(spot - aa, spot + aa, d);
}

// Clustered dots remain center-origin circles over the full tone range.
// Up through 50% ink, the area-derived radius is unchanged. Darker tones
// continue growing that same circle toward a sub-cell cap, avoiding both the
// hard grid seams and circles clipped into squares.
const float DOT_AREA_CAP = 0.50;
const float PI = 3.141592653589793;
const float MID_DOT_RADIUS = 0.39894228; // sqrt(0.5 / PI)
const float MAX_DOT_RADIUS = 0.48;

float roundDotCoverage(vec2 offset, float value, float sharpnessPct) {
    float inkAmount = clamp(value, 0.0, 1.0);
    float centerDistance = length(offset);
    float inkRadius = sqrt(min(inkAmount, DOT_AREA_CAP) / PI);
    if (inkAmount > DOT_AREA_CAP) {
        inkRadius = mix(MID_DOT_RADIUS, MAX_DOT_RADIUS,
            (inkAmount - DOT_AREA_CAP) / (1.0 - DOT_AREA_CAP));
    }
    float softness = 1.0 - clamp(sharpnessPct / 100.0, 0.0, 1.0);
    float centerAA = max(mix(fwidth(centerDistance) * 1.5, 0.35, softness), 0.00001);
    float resolvedInk = smoothstep(0.0, 1.0 / 255.0, value);
    return (1.0 - smoothstep(-centerAA, centerAA,
        centerDistance - inkRadius)) * resolvedInk;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = 1.0 / resolution;
    float alpha = texture(inputTex, uv).a;

#if MODE == 0
    // Subtractive color halftone.
    vec2 ruvC = rotate2D(globalCoord, cyanAngle) / frequency;
    vec2 ruvM = rotate2D(globalCoord, magentaAngle) / frequency;
    vec2 ruvY = rotate2D(globalCoord, yellowAngle) / frequency;
    vec2 ruvK = rotate2D(globalCoord, blackAngle) / frequency;
    float valC = rgbToCmyk(cellSampleFromRuv(ruvC, cyanAngle, texel)).r;
    float valM = rgbToCmyk(cellSampleFromRuv(ruvM, magentaAngle, texel)).g;
    float valY = rgbToCmyk(cellSampleFromRuv(ruvY, yellowAngle, texel)).b;
    float valK = rgbToCmyk(cellSampleFromRuv(ruvK, blackAngle, texel)).a;
    float inkC = roundDotCoverage(fract(ruvC) - 0.5, valC, sharpness);
    float inkM = roundDotCoverage(fract(ruvM) - 0.5, valM, sharpness);
    float inkY = roundDotCoverage(fract(ruvY) - 0.5, valY, sharpness);
    float inkK = roundDotCoverage(fract(ruvK) - 0.5, valK, sharpness);
    vec3 screened = (vec3(1.0) - vec3(inkC, inkM, inkY)) * (1.0 - inkK);
    fragColor = vec4(screened, alpha);
    return;
#else
    // Monochrome screen pattern.
    float value;
    float d;
    vec2 dotOffset = vec2(0.0);
#if PATTERN == 2
    // circle: concentric rings from the fixed image center, unrotated.
    vec2 center = fullResolution * 0.5;
    value = 1.0 - lum(boxBlur3(uv, texel));
    float rd = length(globalCoord - center) / frequency;
    d = abs(fract(rd) - 0.5);
#else
    vec2 ruv = rotate2D(globalCoord, monoAngle) / frequency;
    value = 1.0 - lum(cellSampleFromRuv(ruv, monoAngle, texel));
    vec2 off = fract(ruv) - 0.5;
    dotOffset = off;
    // 1 = line, else dot
#if PATTERN == 1
    d = abs(off.y);
#else
    d = length(off);
#endif
#endif
#if PATTERN == 0
    float ink = roundDotCoverage(dotOffset, value, sharpness);
#else
    float ink = halftoneCoverage(d, value, sharpness);
#endif
    fragColor = vec4(tonemap2(1.0 - ink, inkColor, paperColor), alpha);
#endif
}
