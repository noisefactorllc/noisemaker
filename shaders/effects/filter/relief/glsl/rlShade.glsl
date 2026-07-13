/*
 * Relief - shading pass.
 *
 * Reads the blurred image (_rlBlur, written by rlBlurH/rlBlurV) as a height
 * field via luminance (luminance lum), computes a per-pixel directional-light
 * shade from a 1px forward-difference gradient (relief shading reliefShade), and
 * tonemaps (ink/paper tonemapping) between inkColor/paperColor per `mode`:
 *
 *   basRelief (0): classic two-tone carved relief - shade blended 75/25
 *     with the raw height, mapped straight to ink/paper.
 *   plaster (1): height pushed through a hard smoothstep (blobby, mostly-
 *     flat plateaus) and inverted (dark source areas read as raised), lit
 *     with a squared (glossier, narrower) shade term, same 75/25 blend and
 *     tonemap as basRelief - reusing that structural recipe with a
 *     different height/shade shaping is what gives plaster its smooth
 *     molded look without inventing a second blend constant.
 *   notePaper (2): height hard-thresholded at `balance` into two flat
 *     paper sheets (inkColor*0.9+0.1 / paperColor, no gradient blend); a
 *     directional bevel shade is applied only in a ~2px band around the
 *     threshold contour (band width in height-space approximated from the
 *     local height gradient magnitude, so it stays ~2px wide on screen
 *     regardless of local contrast), and a per-pixel hash grain scaled by
 *     `graininess` is added to the result.
 *
 * Y-orientation: hC/hR/hT sample _rlBlur (a same-effect prior-pass FBO)
 * through the standard per-backend native uv convention
 * (gl_FragCoord.xy/resolution in GLSL, pos.xy/texSize in WGSL) with NO
 * manual Y compensation. This same-effect intermediate read is orientation-transparent
 * on both backends - it matches on-screen presentation and matches
 * inputTex, with no mirroring - so GLSL and WGSL use textually identical
 * sampling and gradient math here.
 *
 * The light vector L = normalize(vec3(cos(a), sin(a), 0.75)) is a plain
 * function of the lightAngle uniform - not fragment-coordinate-derived at
 * all - so it is likewise textually identical in both shaders. Standard
 * convention: a = radians(lightAngle); at lightAngle=135, cos(a) < 0 and
 * sin(a) > 0, so L points left+up in this always-Y-up-on-screen frame
 * (screen presentation is Y-up on both backends), landing the lit side
 * upper-left; at lightAngle=-45 (135-180, the opposite direction), the
 * lit side flips to lower-right.
 *
 * The grain hash coordinate is the integer, tile-aware global pixel
 * position (gl_FragCoord + tileOffset, floored) rather than local
 * gl_FragCoord, so the grain pattern is seamless across CLI render tiles
 * instead of restarting at each tile's local origin (filter/wind's
 * per-scanline-hash precedent).
 */

#ifdef GL_ES
precision highp float;
#endif

// MODE is a compile-time define injected by the runtime (see definition.js
// `globals.mode.define`). Each mode is a distinct shade+tonemap path; baking
// MODE lets the compiler drop the two dead arms instead of branching at
// runtime on a value that is constant for the whole draw.
#ifndef MODE
#define MODE 0
#endif

uniform sampler2D inputTex;
uniform sampler2D blurTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float detail;
uniform float lightAngle;
uniform float balance;
uniform float graininess;
uniform vec3 inkColor;
uniform vec3 paperColor;

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float reliefShade(float hC, float hR, float hT, float strength, float lightAngleDeg) {
    vec2 grad = vec2(hR - hC, hT - hC) * strength;
    vec3 n = normalize(vec3(-grad, 1.0));
    float a = radians(lightAngleDeg);
    vec3 L = normalize(vec3(cos(a), sin(a), 0.75));
    return clamp(dot(n, L), 0.0, 1.0);
}

vec3 tonemap2(float t, vec3 ink, vec3 paper) {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = 1.0 / resolution;
    vec4 src = texture(inputTex, uv);

    float hC = lum(texture(blurTex, uv).rgb);
    float hR = lum(texture(blurTex, uv + vec2(texel.x, 0.0)).rgb);
    float hT = lum(texture(blurTex, uv + vec2(0.0, texel.y)).rgb);

    float strength = detail * 0.2;
    vec3 outColor;

#if MODE==0
    // Bas Relief (mode 0, default): shade blended with raw height,
    // linear tonemap.
    float shade = reliefShade(hC, hR, hT, strength, lightAngle);
    outColor = tonemap2(mix(hC, shade, 0.75), inkColor, paperColor);
#elif MODE==1
    // Plaster: hard blobby height plateau, inverted (dark source =
    // raised), glossy (squared) shade.
    float hhC = 1.0 - smoothstep(0.35, 0.65, hC);
    float hhR = 1.0 - smoothstep(0.35, 0.65, hR);
    float hhT = 1.0 - smoothstep(0.35, 0.65, hT);
    float shade = reliefShade(hhC, hhR, hhT, strength, lightAngle);
    float glossy = pow(shade, 2.0);
    outColor = tonemap2(mix(hhC, glossy, 0.75), inkColor, paperColor);
#elif MODE==2
    // Note Paper: binary threshold cutout with a beveled contour band
    // and grain.
    float threshold = balance / 100.0;
    float m = step(threshold, hC);
    vec3 sheet = mix(inkColor * 0.9 + 0.1, paperColor, m);

    float shade = reliefShade(hC, hR, hT, strength, lightAngle);
    float gradMag = length(vec2(hR - hC, hT - hC));
    float bandHeight = max(gradMag * 2.0, 1e-5);
    float edge = 1.0 - smoothstep(0.0, bandHeight, abs(hC - threshold));
    vec3 beveled = clamp(sheet * mix(0.6, 1.4, shade), 0.0, 1.0);
    vec3 sheetOut = mix(sheet, beveled, edge);

    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    float grain = (hash12(floor(globalCoord)) - 0.5) * (graininess / 100.0) * 0.15;

    outColor = clamp(sheetOut + vec3(grain), 0.0, 1.0);
#endif

    fragColor = vec4(outColor, src.a);
}
