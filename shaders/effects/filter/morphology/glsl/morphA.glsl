/*
 * Morphology - pass A: square shape uses a horizontal-line structuring
 * element (finished by morphB's vertical pass -- min/max over a box is
 * separable into two 1D passes); round shape computes the full disc
 * structuring element here in one pass (min/max over a disc is NOT
 * separable), so morphB is a passthrough copy for that shape.
 * mode selects the op: dilate (0) = max, erode (1) = min.
 */

#ifdef GL_ES
precision highp float;
#endif

// SHAPE is a compile-time definition (see definition.js `globals.shape.define`).
// Disc (625 taps) and line (64 taps) are fully distinct neighborhood loops;
// baking the choice lets the compiler drop the unused loop entirely instead
// of carrying both bounds behind a runtime branch.
#ifndef SHAPE
#define SHAPE 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform int mode;
uniform float radius;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = 1.0 / resolution;
    vec4 acc = texture(inputTex, uv);

#if SHAPE==1
    // Round: full disc structuring element, capped at radius 12 so the
    // worst case (625 taps) stays bounded regardless of the radius max.
    float r = min(radius, 12.0);
    float r2 = r * r;
    for (int y = -12; y <= 12; y++) {
        for (int x = -12; x <= 12; x++) {
            if (x == 0 && y == 0) { continue; }
            vec2 d = vec2(float(x), float(y));
            if (dot(d, d) > r2) { continue; }
            vec4 s = texture(inputTex, uv + d * texel);
            vec4 hi = max(acc, s);
            vec4 lo = min(acc, s);
            acc = mix(hi, lo, float(mode));
        }
    }
#else
    // Square: horizontal-line structuring element over |i| <= radius.
    float r = min(radius, 32.0);
    for (int i = 1; i <= 32; i++) {
        if (float(i) > r) { break; }
        vec2 o = vec2(float(i), 0.0) * texel;
        vec4 sL = texture(inputTex, uv - o);
        vec4 sR = texture(inputTex, uv + o);
        vec4 hi = max(acc, max(sL, sR));
        vec4 lo = min(acc, min(sL, sR));
        acc = mix(hi, lo, float(mode));
    }
#endif

    fragColor = acc;
}
