#version 300 es

/*
 * Temporal Chromatic Aberration - read pass.
 *
 * Samples the live frame (delay 0) and the eight history stages _h1.._h8 (delay 1..8),
 * then builds each output channel from a different, independently delayed frame so colour
 * separates in time. Delays are fractional: adjacent stored frames are interpolated.
 *
 * Runs before the shift passes, so the history textures still hold last frame's values.
 * A history slot that has never been written has alpha 0 (textures init to zero); such a
 * slot falls back to the live frame, giving a clean ramp-in over the first frames instead
 * of black.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D h1;
uniform sampler2D h2;
uniform sampler2D h3;
uniform sampler2D h4;
uniform sampler2D h5;
uniform sampler2D h6;
uniform sampler2D h7;
uniform sampler2D h8;

uniform float redDelay;
uniform float greenDelay;
uniform float blueDelay;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    vec4 cur = texture(inputTex, uv);

    // slots[0] = live (delay 0); slots[1..8] = history (delay 1..8) with empty -> live.
    vec4 slots[9];
    slots[0] = cur;
    vec4 s;
    s = texture(h1, uv); slots[1] = (s.a < 0.5) ? cur : s;
    s = texture(h2, uv); slots[2] = (s.a < 0.5) ? cur : s;
    s = texture(h3, uv); slots[3] = (s.a < 0.5) ? cur : s;
    s = texture(h4, uv); slots[4] = (s.a < 0.5) ? cur : s;
    s = texture(h5, uv); slots[5] = (s.a < 0.5) ? cur : s;
    s = texture(h6, uv); slots[6] = (s.a < 0.5) ? cur : s;
    s = texture(h7, uv); slots[7] = (s.a < 0.5) ? cur : s;
    s = texture(h8, uv); slots[8] = (s.a < 0.5) ? cur : s;

    float dr = clamp(redDelay, 0.0, 8.0);
    int ir0 = int(floor(dr));
    int ir1 = min(ir0 + 1, 8);
    float rOut = mix(slots[ir0], slots[ir1], dr - float(ir0)).r;

    float dg = clamp(greenDelay, 0.0, 8.0);
    int ig0 = int(floor(dg));
    int ig1 = min(ig0 + 1, 8);
    float gOut = mix(slots[ig0], slots[ig1], dg - float(ig0)).g;

    float db = clamp(blueDelay, 0.0, 8.0);
    int ib0 = int(floor(db));
    int ib1 = min(ib0 + 1, 8);
    float bOut = mix(slots[ib0], slots[ib1], db - float(ib0)).b;

    fragColor = vec4(rOut, gOut, bOut, cur.a);
}
