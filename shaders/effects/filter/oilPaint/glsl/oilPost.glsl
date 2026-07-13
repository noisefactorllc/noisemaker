/*
 * Oil Paint - post pass: reshapes the flattened (oilFlatten) result into
 * one of six classic-filter fidelity painterly looks selected by MODE, then
 * applies a shared granulation pass to every mode.
 *   facet (0)     - passthrough of the flattened patches.
 *   daubs (1)     - unsharp the flattened patches for crisp dab edges.
 *   dryBrush (2)  - posterize + a slight edge darken.
 *   fresco (3)    - darken edges by local gradient magnitude, then an
 *                   S-curve contrast boost.
 *   knife (4)     - soften patch boundaries with a tent blur mixed by
 *                   `detail`.
 *   sponge (5)    - blotchy fbm-driven brightness bands.
 *
 * MODE is a compile-time define injected by the runtime (see definition.js
 * globals.mode.define), same mechanism as filter/texture and filter/grain.
 */

#ifndef MODE
#define MODE 1
#endif

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D flatTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float size;
uniform float detail;
uniform float textureAmount;
uniform int seed;

out vec4 fragColor;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

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

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Sobel gradient gradient, applied to the FLATTENED texture (fresco/dryBrush edges).
vec2 lumGradientFlat(vec2 uv) {
    vec2 px = 1.0 / resolution;
    float tl = lum(texture(flatTex, uv + px * vec2(-1.0,  1.0)).rgb);
    float  l = lum(texture(flatTex, uv + px * vec2(-1.0,  0.0)).rgb);
    float bl = lum(texture(flatTex, uv + px * vec2(-1.0, -1.0)).rgb);
    float tr = lum(texture(flatTex, uv + px * vec2( 1.0,  1.0)).rgb);
    float  r = lum(texture(flatTex, uv + px * vec2( 1.0,  0.0)).rgb);
    float br = lum(texture(flatTex, uv + px * vec2( 1.0, -1.0)).rgb);
    float  t = lum(texture(flatTex, uv + px * vec2( 0.0,  1.0)).rgb);
    float  b = lum(texture(flatTex, uv + px * vec2( 0.0, -1.0)).rgb);
    return vec2(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

// 3x3 tent blur of the flattened texture. Shared by daubs' unsharp
// mask (MODE 1) and knife's softening blend (MODE 4) -- same blur, ONE WAY
// ONLY; only the per-mode mix weight differs.
vec3 tent3x3(vec2 uv) {
    vec2 px = 1.0 / resolution;
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            float w = (dx == 0 ? 2.0 : 1.0) * (dy == 0 ? 2.0 : 1.0);
            sum += texture(flatTex, uv + vec2(float(dx), float(dy)) * px).rgb * w;
            wsum += w;
        }
    }
    return sum / wsum;
}

float sCurve(float x) {
    float t = clamp(x, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// Dispatch to the active mode's reshape -- single variant selected at
// compile time by the MODE define.
vec3 modeColor(vec2 uv, vec3 c, vec2 globalCoord) {
#if MODE == 0
    return c;
#elif MODE == 1
    vec3 blurred = tent3x3(uv);
    return c + (c - blurred) * (detail / 25.0);
#elif MODE == 2
    // GLSL round() ties are implementation-defined; floor(x + 0.5) is a
    // deterministic round-half-up that matches WGSL bit-for-bit.
    float levels = floor(mix(8.0, 3.0, detail / 100.0) + 0.5);
    vec3 poster = floor(c * levels) / levels;
    float gradMag = length(lumGradientFlat(uv));
    // 1.5 is the gradient-to-alpha gain and 0.15 caps edge darkening.
    // This reuses fresco's
    // (MODE 3) lumGradientFlat helper but applies it as a subtler,
    // capped darken rather than fresco's stronger detail-scaled darken.
    float edgeDarken = clamp(gradMag * 1.5, 0.0, 1.0) * 0.15;
    return poster * (1.0 - edgeDarken);
#elif MODE == 3
    float gradMag = length(lumGradientFlat(uv));
    vec3 darkened = c * (1.0 - 0.6 * (detail / 100.0) * gradMag);
    return vec3(sCurve(darkened.r), sCurve(darkened.g), sCurve(darkened.b));
#elif MODE == 4
    vec3 blurred = tent3x3(uv);
    return mix(c, blurred, detail / 100.0);
#else
    // sponge (5, default/fallback)
    float band = fbm((globalCoord + float(seed) * 37.0) / (4.0 + size));
    float shift = (band * 2.0 - 1.0) * (detail / 100.0) * 0.25;
    return clamp(c + vec3(shift), 0.0, 1.0);
#endif
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec3 c = texture(flatTex, uv).rgb;

    // Tile-aware integer global pixel coordinate for noise/hash inputs.
    // KERNEL sampling above (tent3x3/lumGradientFlat) uses the local uv
    // path; NOISE/hash uses this integer global pixel instead.
    vec2 globalCoord = floor(gl_FragCoord.xy) + tileOffset;

    vec3 outc = modeColor(uv, c, globalCoord);

    // Granulation (all modes): mix in a subtle brightness-modulating noise.
    // textureAmount = 0 is a no-op (mix factor 0).
    vec3 grained = outc * (0.85 + 0.3 * vnoise(globalCoord / 2.0));
    outc = mix(outc, grained, (textureAmount / 100.0) * 0.5);

    fragColor = vec4(clamp(outc, 0.0, 1.0), src.a);
}
