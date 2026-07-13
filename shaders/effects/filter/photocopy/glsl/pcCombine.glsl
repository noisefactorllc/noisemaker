/*
 * Photocopy - combine pass.
 *
 * Two independent ink contributions, combined with max() so neither term
 * has to carry the whole image alone:
 *
 * 1. Edge ink: band = lum(src) - lum(blur) is the difference-of-Gaussians
 *    signal. abs(band) inks BOTH sides of an edge (a thin double-line
 *    contour, the characteristic photocopier edge artifact), gained by
 *    `darkness` via edgeGain = mix(4, 18, darkness/100).
 *
 * 2. Tonal ink: toneInk = 1 - smoothstep(toneLo, toneHi, lumSrc) fills
 *    the source's own mid-dark regions with solid ink directly, independent
 *    of edge content - this is what keeps the image's actual shapes legible
 *    as ink instead of relying on sparse hairline edges (a soft/low-contrast
 *    source has a tiny DoG band almost everywhere, which starved the old
 *    edge-only formula down to near-blank paper). toneHi = mix(0.35, 0.68,
 *    darkness/100) tracks `darkness` so raising it both thickens edges and
 *    inks a larger share of the tonal range; toneLo = toneHi - 0.26 is a
 *    fixed-width falling ramp below it (complement-smoothstep idiom:
 *    ascending edge0<edge1, negated - see ink/paper tonemapping callers elsewhere).
 *
 * ink = clamp(max(edgeInk, toneInk), 0, 1). Flat source: band=0 identically
 * (blur of a flat field equals the field), so edgeInk=0 and ink=toneInk
 * alone - a fully bright flat source (lumSrc=1 > toneHi) renders pure
 * paper, a fully dark flat source (lumSrc=0 < toneLo) renders solid ink,
 * matching Photocopy's expected flat-case response exactly as before.
 *
 * tonemap2 (ink/paper tonemapping): t=1 -> paper, so 1-ink means full ink -> ink color, zero
 * ink -> paper color. Alpha is taken from the source, not the blur.
 *
 * No directional light, no rotation, no fragment-coordinate-derived
 * vectors anywhere in this pass (DoG is isotropic) - GLSL and WGSL are
 * textually identical, no Y-orientation compensation needed.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D blurTex;
uniform vec2 resolution;
uniform float darkness;
uniform vec3 inkColor;
uniform vec3 paperColor;

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 tonemap2(float t, vec3 ink, vec3 paper) {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec4 blur = texture(blurTex, uv);

    float lumSrc = lum(src.rgb);
    float lumBlur = lum(blur.rgb);
    float band = lumSrc - lumBlur;

    float edgeGain = mix(4.0, 18.0, darkness / 100.0);
    float edgeInk = clamp(abs(band) * edgeGain, 0.0, 1.0);

    float toneHi = mix(0.35, 0.68, darkness / 100.0);
    float toneLo = toneHi - 0.26;
    float toneInk = 1.0 - smoothstep(toneLo, toneHi, lumSrc);

    float ink = clamp(max(edgeInk, toneInk), 0.0, 1.0);

    vec3 outColor = tonemap2(1.0 - ink, inkColor, paperColor);
    fragColor = vec4(outColor, src.a);
}
