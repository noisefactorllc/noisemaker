/*
 * Stamp - threshold pass.
 *
 * Reads the blurred image (_stBlur, written by stBlurH/stBlurV) as a
 * luminance height field (luminance lum) and thresholds it into two flat ink/
 * paper tones (ink/paper tonemapping tonemap2), the way a rubber stamp impression flattens an
 * image to two colors.
 *
 * t = lum(blur) + (fbm(globalCoord/3.0) - 0.5) * roughness/100 * 0.35: the
 * blurred luminance is the base height field; roughness > 0 perturbs it
 * with tile-aware value noise (value noise fbm over hash hash, integer global pixel
 * coordinate) so the threshold contour gets ragged (Torn
 * Edges) instead of staying a clean iso-line (roughness = 0, Stamp).
 *
 * b = balance/100 is the threshold. aa = max(fwidth(t), 0.01) +
 * roughness/100 * 0.05 is the smoothstep half-width: fwidth(t) keeps the
 * contour's AA screen-resolution-independent at roughness = 0, and the
 * roughness term widens it further so torn edges read as slightly soft/
 * grainy rather than crisply aliased. aa is always > 0 (the 0.01 floor),
 * so b - aa < b + aa always holds and smoothstep's arguments are always in
 * forward order.
 *
 * m = smoothstep(b - aa, b + aa, t), then tonemap2(m, inkColor,
 * paperColor): m = 1 (bright source) -> paper, m = 0 (dark source) -> ink -
 * classic rubber-stamp polarity (bright regions leave blank paper, dark
 * regions stamp ink). Alpha is taken from the source, not the blur.
 *
 * fbm/hash noise here is isotropic per-pixel value noise - no directional
 * light, no rotation, nothing fragment-coordinate-derived beyond the noise
 * coordinate itself - so this pass needs no backend-specific Y compensation;
 * GLSL and WGSL are textually identical
 * throughout (matches photocopy's DoG precedent).
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D blurTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float balance;
uniform float roughness;
uniform vec3 inkColor;
uniform vec3 paperColor;

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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

vec3 tonemap2(float t, vec3 ink, vec3 paper) {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec4 blur = texture(blurTex, uv);

    // Tile-aware integer global pixel coordinate for the noise input, per
    // the grain lesson (oilPaint's oilPost precedent).
    vec2 globalCoord = floor(gl_FragCoord.xy) + tileOffset;

    float lumBlur = lum(blur.rgb);
    float grain = (fbm(globalCoord / 3.0) - 0.5) * (roughness / 100.0) * 0.35;
    float t = lumBlur + grain;

    float b = balance / 100.0;
    float aa = max(fwidth(t), 0.01) + (roughness / 100.0) * 0.05;
    float m = smoothstep(b - aa, b + aa, t);

    vec3 outColor = tonemap2(m, inkColor, paperColor);
    fragColor = vec4(outColor, src.a);
}
