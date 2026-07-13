/*
 * Hatch - single-pass six-mode sketch engine. See definition.js for the
 * full per-mode description and filter mapping. MODE is a
 * compile-time define injected by the runtime (globals.mode.define), same
 * mechanism as filter/oilPaint and filter/texture.
 *
 * Every mode reads the same stroke field, strokeField(gc, angleDeg,
 * stretch) = vnoise(rotate2D(gc, angleDeg) * vec2(1/stretch, 0.9)), on the
 * tile-aware integer GLOBAL pixel coordinate gc (floor(gl_FragCoord) +
 * tileOffset) so the pattern is seamless across CLI render tiles.
 *
 * rotate2D rotates gc, a fragment-position-derived vector, with the
 * mat2(c,-s,s,c) form shared by filter/stipple - no manual Y
 * compensation. Every noise/hash helper below is floor/fract-based (not
 * truncated) for negative inputs, so the negative positions a rotation can
 * produce need no separate floored-mod wrap (same reasoning as filter/
 * stipple's mezzoStrokes and filter/halftone's rotated cell math).
 */

#ifndef MODE
#define MODE 0
#endif

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float strokeLength;
uniform int direction;
uniform float balance;
uniform float pressure;
uniform vec3 inkColor;
uniform vec3 paperColor;

out vec4 fragColor;

// hash - hash / jitter.
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// luminance - luminance.
float lum(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// value noise - value noise + fBm.
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

// Sobel gradient - gradient (Sobel on luminance), used by coloredPencil to bend
// strokes along image contours.
vec2 lumGradient(vec2 uv) {
    vec2 px = 1.0 / resolution;
    float tl = lum(texture(inputTex, uv + px * vec2(-1.0,  1.0)).rgb);
    float  l = lum(texture(inputTex, uv + px * vec2(-1.0,  0.0)).rgb);
    float bl = lum(texture(inputTex, uv + px * vec2(-1.0, -1.0)).rgb);
    float tr = lum(texture(inputTex, uv + px * vec2( 1.0,  1.0)).rgb);
    float  r = lum(texture(inputTex, uv + px * vec2( 1.0,  0.0)).rgb);
    float br = lum(texture(inputTex, uv + px * vec2( 1.0, -1.0)).rgb);
    float  t = lum(texture(inputTex, uv + px * vec2( 0.0,  1.0)).rgb);
    float  b = lum(texture(inputTex, uv + px * vec2( 0.0, -1.0)).rgb);
    return vec2(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

// ink/paper tonemapping - ink/paper tonemap.
vec3 tonemap2(float t, vec3 ink, vec3 paper) {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

// Rotates a position-derived (global pixel space) vector by angleDeg.
// GLSL mat2(c,-s,s,c) rotation for the global pixel coordinate.
vec2 rotate2D(vec2 v, float angleDeg) {
    float a = radians(angleDeg);
    float co = cos(a);
    float si = sin(a);
    return mat2(co, -si, si, co) * v;
}

// direction (0..3) -> stroke angle in degrees: rightDiag/horizontal/
// leftDiag/vertical.
float dirAngle(int d) {
    if (d == 1) { return 0.0; }
    if (d == 2) { return 135.0; }
    if (d == 3) { return 90.0; }
    return 45.0; // rightDiag (0, default)
}

// Shared stroke field: elongated value noise along angleDeg. `stretchAmt`
// pixels of near-constant value along the stroke axis (1/stretchAmt
// frequency), near-full-pixel frequency (0.9) across it, so each "fiber"
// reads as a thin, direction-aligned stroke rather than a blob.
float strokeField(vec2 gc, float angleDeg, float stretchAmt) {
    vec2 p = rotate2D(gc, angleDeg) * vec2(1.0 / stretchAmt, 0.9);
    return vnoise(p);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec2 gc = floor(gl_FragCoord.xy) + tileOffset;

    float theta = dirAngle(direction);
    float stretchAmt = mix(4.0, 40.0, strokeLength / 100.0);
    float t = lum(src.rgb) + (balance - 50.0) / 100.0;
    // pressure bias, shared by every mode's pressure role below.
    float pb = (pressure - 50.0) / 100.0;
    float s = strokeField(gc, theta, stretchAmt);

    vec3 outColor;

#if MODE == 0
    // Graphic Pen: single-direction hard threshold of the stroke field
    // against tone - the starkest, most binary mode. pressure isn't given
    // an explicit role in the core formula ("ink = step(s, 1-t)"), so it
    // gets a small coverage nudge that is exactly zero at the default
    // pressure=50 (reduces to the core formula there) and only
    // shifts coverage as pressure moves away from center - keeps
    // `pressure` responsive at the default mode without changing the
    // documented default look.
    float inkMask = step(s, clamp(1.0 - t + pb * 0.3, 0.0, 1.0));
    outColor = tonemap2(1.0 - inkMask, inkColor, paperColor);
#elif MODE == 1
    // Charcoal: rougher 2-octave stroke noise (blend a half-length second
    // octave into the primary field), ink only in the shadow region
    // (t < 0.55, softly gated), paper elsewhere. pressure scales both how
    // much of the shadow region fills with ink (coverage) and how dark
    // that ink reads (darkness).
    float s2 = strokeField(gc * 2.0 + 91.7, theta, stretchAmt * 0.5);
    float rough = s * 0.6 + s2 * 0.4;
    float shadow = 1.0 - smoothstep(0.15, 0.55, t);
    float coverage = clamp(shadow + pb * 0.5, 0.0, 1.0);
    float inkMask = step(1.0 - coverage, rough);
    float darkness = mix(0.55, 1.0, pressure / 100.0);
    vec3 inkC = mix(paperColor, inkColor, darkness);
    outColor = mix(paperColor, inkC, inkMask);
#elif MODE == 2
    // Chalk & Charcoal: mid-gray paper base; dark charcoal strokes at
    // theta fill the shadows (t<0.4), paper-colored chalk strokes at
    // theta+90 fill the highlights (t>0.6). pressure = stroke contrast: it
    // sharpens (narrows) the smoothstep gate on both stroke layers, so low
    // pressure reads as soft/smudgy and high pressure as crisp.
    vec3 midGray = mix(inkColor, paperColor, 0.5);
    float sBg = strokeField(gc, theta + 90.0, stretchAmt);
    float aa = mix(0.4, 0.04, pressure / 100.0);
    float fgGate = 1.0 - smoothstep(0.4 - aa, 0.4 + aa, t);
    float fgMask = step(1.0 - fgGate, s);
    float bgGate = smoothstep(0.6 - aa, 0.6 + aa, t);
    float bgMask = step(1.0 - bgGate, sBg);
    outColor = midGray;
    outColor = mix(outColor, inkColor, fgMask);
    outColor = mix(outColor, paperColor, bgMask);
#elif MODE == 3
    // Conte Crayon: two-level remap (dark->ink, light->paper); the
    // midtone band is filled with fbm-textured stroke noise instead of a
    // flat gradient, so the transition between ink and paper looks
    // hand-textured rather than a smooth gradient. pressure isn't given an
    // explicit role in the core formula either, so it gets the same small,
    // default-neutral nudge as pen (zero at pressure=50).
    float toneGate = smoothstep(0.3, 0.7, t);
    float texture2 = mix(s, fbm(gc / (stretchAmt * 0.6) + 41.0), 0.5);
    float level = mix(texture2, toneGate, abs(toneGate * 2.0 - 1.0));
    level = clamp(level + pb * 0.15, 0.0, 1.0);
    outColor = tonemap2(level, inkColor, paperColor);
#elif MODE == 4
    // Crosshatch: COLOR-PRESERVING. Keeps src.rgb and multiplies in up to
    // 3 stroke fields (theta, theta+45, theta-45), each gated to a
    // progressively narrower/darker tone band, so shadows accumulate more
    // crossing layers than midtones - real crosshatch technique. pressure
    // = darkness of hatching (the gain on every layer's multiplicative
    // darkening).
    float s45a = strokeField(gc, theta + 45.0, stretchAmt);
    float s45b = strokeField(gc, theta - 45.0, stretchAmt);
    float band1 = 1.0 - smoothstep(0.65, 0.85, t);
    float band2 = 1.0 - smoothstep(0.35, 0.55, t);
    float band3 = 1.0 - smoothstep(0.05, 0.25, t);
    float darkGain = mix(0.25, 1.0, pressure / 100.0);
    float f0 = 1.0 - band1 * darkGain * (1.0 - s);
    float f1 = 1.0 - band2 * darkGain * (1.0 - s45a);
    float f2 = 1.0 - band3 * darkGain * (1.0 - s45b);
    outColor = clamp(src.rgb * f0 * f1 * f2, 0.0, 1.0);
#else
    // coloredPencil (5) - fallback arm of the #if/#elif chain (MODE is
    // always 0-5, injected by the runtime, so the last value needs no
    // explicit check). COLOR-PRESERVING: image color shows through only
    // inside the stroke mask; paper shows between strokes. Mask density
    // follows tone (dark areas denser strokes) and bends to follow local
    // contours near strong edges (Sobel gradient gradient direction, rotated
    // perpendicular to point along the contour), like pencil hatching
    // drawn along a subject's outline. pressure = coverage.
    vec2 grad = lumGradient(uv);
    float gradMag = length(grad);
    float edgeAngle = degrees(atan(grad.y, grad.x)) + 90.0;
    float sEdge = strokeField(gc, edgeAngle, stretchAmt);
    float edgeBoost = clamp(gradMag * 3.0, 0.0, 1.0);
    float sCombined = mix(s, sEdge, edgeBoost);
    float coverage = clamp((1.0 - t) + pb * 0.4, 0.0, 1.0);
    float strokeMask = step(1.0 - coverage, sCombined);
    outColor = mix(paperColor, src.rgb, strokeMask);
#endif

    fragColor = vec4(clamp(outColor, 0.0, 1.0), src.a);
}
