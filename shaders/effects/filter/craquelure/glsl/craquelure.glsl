/*
 * Craquelure - cracked-plaster groove network with carved relief over the
 * image.
 *
 * Crack field: Voronoi's jittered-grid Voronoi cell (see voronoiCell in e.g.
 * filter/stipple.glsl) is extended here to voronoiF1F2, which tracks the
 * nearest (F1) AND second-nearest (F2) seed distances instead of just the
 * nearest cell id. (F2 - F1) is the standard "distance to the Voronoi
 * border" proxy: it is exactly 0 ON a cell border (where two seeds are
 * equidistant) and grows the further a point sits from any border, so
 * `k = 1 - smoothstep(0, edge, (F2-F1)*spacing)` is a ridge function that
 * peaks at 1 exactly on cell borders and falls to 0 within `edge` pixels
 * - i.e. the crack groove cross-section. `edge = 1.5 + depth/100*2` is
 * the groove's half-width in px, so `depth` widens the crack band.
 *
 * Voronoi jitter is fixed at 1.0 (the maximum value Voronoi's 3x3-neighbor
 * search window supports - see voronoiF1F2's docstring: the search is
 * exact for F1 at this jitter, with F2 only rarely under-counted near a
 * cell's corner) for maximally irregular, organic plate shapes, matching
 * real crazed plaster/glaze.
 *
 * Border wobble: before the Voronoi search, the sample position is
 * perturbed by two INDEPENDENT noise taps, one per axis -
 * `vec2(vnoise(gc/6), vnoise(gc/6 + vec2(37.7, 91.3))) * 2` px (same 2px
 * amplitude as a single-scalar wobble; the additive offset decorrelates
 * the second tap from the first). A single scalar broadcast to both axes
 * only displaces the sample along the (1,1) diagonal, leaving
 * diagonal-tangent border segments unperturbed - a visible blind spot.
 * Independent per-axis taps wobble the crack path in every direction, so
 * borders weave organically regardless of their local tangent angle.
 *
 * Wall shading: the crack mask k is re-evaluated at 4 neighboring
 * (gc +/- 1px on each axis) positions to build a true central-difference
 * gradient of k (5 bounded Voronoi evaluations total). A cheaper
 * forward-difference, as filter/relief's rlShade.glsl
 * uses for its cheap-to-sample blurred-luminance height field, would
 * bias the bevel normal off-axis for a feature this narrow, since k's
 * transition width can be as little as 1.5px). The height fed to filter/relief's
 * reliefShade (see filter/relief) is -k, NOT +k: a crack is a carved
 * groove (a dip), not a raised ridge, so height must FALL toward the
 * crack center. This is implemented by negating hC/hR/hT (hC = -kC, hR
 * = hC - centralGradX, hT = hC - centralGradY) so reliefShade's internal
 * forward-difference subtraction reproduces the true central-difference
 * gradient of -k exactly - equivalently, this flips the sign of the
 * gradient/normal reliefShade sees versus feeding +k directly, which is
 * what puts the lit wall on the correct (concave-groove) side of the
 * crack. Light angle is fixed at 135 degrees (filter/relief's default
 * convention - upper-left; craquelure exposes no
 * lightAngle param). reliefShade's flat-gradient (grad=0) baseline is
 * dot((0,0,1), normalize(vec3(cos135, sin135, 0.75))) = 0.75/1.25 = 0.6
 * EXACTLY, not 0.5 - the shade term is remapped from reliefShade's 0..1
 * output to a subtle `1 +/- 0.25*depth/100` multiplier band centered on
 * shade==0.6 (not 0.5), and additionally gated by `wallMask =
 * smoothstep(0, 0.02, gradMagK)` (gradMagK = length of the same
 * central-diff gradient of k used above) so the multiplier is pinned to
 * EXACTLY 1.0 on flat ground regardless of depth or any future light-
 * vector change, instead of leaking a small global brightening
 * everywhere (the old unmasked, 0.5-centered version leaked because
 * reliefShade's true flat baseline is 0.6). This multiplier is applied
 * on top of the crack darkening - matching filter/relief's notePaper
 * mode precedent of multiplying a shade term onto color (`sheet *
 * mix(0.6, 1.4, shade)`).
 *
 * Output: `c * mix(1, 0.35 + brightness/100*0.5, k)` darkens the image
 * inside cracks (brightness raises the floor, i.e. higher brightness =
 * shallower/paler cracks), then the wall-shade multiplier is applied on
 * top - matching filter/relief's notePaper mode precedent of multiplying
 * a shade term onto color (`sheet * mix(0.6, 1.4, shade)`).
 *
 * Single pass, evaluated on global (tile-aware) pixel coordinates so the
 * crack network is continuous across CLI render tiles.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float spacing;
uniform float depth;
uniform float brightness;
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

// Voronoi extended - jittered-grid Voronoi F1/F2: returns x = nearest seed
// distance (F1), y = second-nearest seed distance (F2), in the same
// cell-space units as `p`. Squared distances are compared internally
// (cheaper); sqrt is taken only for the two winners since the crack
// metric (F2-F1) needs true (not squared) distances to stay in
// consistent px-proportional units once multiplied by `spacing`. Search
// radius is one ring of neighbor cells, so jitter must stay within
// [0, 1] to keep both candidates in-window; this is an EXACT guarantee
// for F1 (the true nearest neighbor cannot be more than one cell away
// at this jitter), but F2 (the second-nearest) can rarely be
// under-counted near a cell's corner at jitter's [0, 1] maximum, where
// the true second-nearest seed can sit just outside the 1-ring window -
// a minor, infrequent error in the crack metric, not a hard guarantee.
vec2 voronoiF1F2(vec2 p, float jitter, float seedVal) {
    vec2 g = floor(p);
    vec2 f = p - g;
    float best = 1e9;
    float second = 1e9;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 cell = vec2(float(x), float(y));
            vec2 pt = cell + 0.5 + (hash22(g + cell + seedVal * 101.7) - 0.5) * jitter;
            float d = dot(pt - f, pt - f);
            if (d < best) {
                second = best;
                best = d;
            } else if (d < second) {
                second = d;
            }
        }
    }
    return vec2(sqrt(best), sqrt(second));
}

// Directional relief shading from height.
float reliefShade(float hC, float hR, float hT, float strength, float lightAngleDeg) {
    vec2 grad = vec2(hR - hC, hT - hC) * strength;
    vec3 n = normalize(vec3(-grad, 1.0));
    float a = radians(lightAngleDeg);
    vec3 L = normalize(vec3(cos(a), sin(a), 0.75));
    return clamp(dot(n, L), 0.0, 1.0);
}

// Crack mask k at global pixel position gc: 1 on a cell border, falling
// to 0 within `edge` px (see file header for the F2-F1 derivation).
float crackMask(vec2 gc, float spacingPx, float depthPct, float seedVal) {
    vec2 wob = vec2(vnoise(gc / 6.0), vnoise(gc / 6.0 + vec2(37.7, 91.3))) * 2.0;
    vec2 p = (gc + wob) / spacingPx;
    vec2 f1f2 = voronoiF1F2(p, 1.0, seedVal);
    float d = (f1f2.y - f1f2.x) * spacingPx;
    float edge = 1.5 + depthPct / 100.0 * 2.0;
    return 1.0 - smoothstep(0.0, edge, d);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    float seedF = float(seed);

    float kC = crackMask(globalCoord, spacing, depth, seedF);
    float kR = crackMask(globalCoord + vec2(1.0, 0.0), spacing, depth, seedF);
    float kL = crackMask(globalCoord - vec2(1.0, 0.0), spacing, depth, seedF);
    float kT = crackMask(globalCoord + vec2(0.0, 1.0), spacing, depth, seedF);
    float kB = crackMask(globalCoord - vec2(0.0, 1.0), spacing, depth, seedF);

    // Central-difference gradient of k; feeds both reliefShade's synthetic
    // height samples below and wallMask's locality gate.
    vec2 gradK = vec2((kR - kL) * 0.5, (kT - kB) * 0.5);

    // Height fed to reliefShade is -k: a crack is a carved groove (a dip),
    // not a raised ridge, so height must fall toward the crack center.
    // Negating hC/hR/hT flips the sign of the gradient/normal reliefShade
    // sees, which flips which groove wall catches the light (see header).
    float hC = -kC;
    float hR = hC - gradK.x;
    float hT = hC - gradK.y;
    float shadeStrength = 6.0;
    float shade = reliefShade(hC, hR, hT, shadeStrength, 135.0);

    // reliefShade's flat-gradient baseline is 0.6, not 0.5 (see header) -
    // recenter on it, and gate by wallMask so flat ground away from any
    // crack gets EXACTLY shadeMul == 1.0 (gradK saturates to exactly 0
    // there by smoothstep's clamped range).
    float gradMagK = length(gradK);
    float wallMask = smoothstep(0.0, 0.02, gradMagK);
    float shadeMul = 1.0 + (shade - 0.6) * 2.0 * (0.25 * depth / 100.0) * wallMask;

    vec3 darkened = src.rgb * mix(1.0, 0.35 + brightness / 100.0 * 0.5, kC);
    vec3 result = clamp(darkened * shadeMul, 0.0, 1.0);

    fragColor = vec4(result, src.a);
}
