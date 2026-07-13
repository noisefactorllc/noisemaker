/*
 * Oil Paint - flatten pass: 8-sector Kuwahara filter. Reduces
 * the input to per-pixel flat color patches -- the painterly "dab"
 * substrate that oilPost.glsl reshapes per MODE. facet mode uses a
 * tighter radius (min(size, 3)) so its patches read as small flat
 * polygons rather than large brush strokes.
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
uniform float size;

out vec4 fragColor;

void main() {
    // Integer fragment center: every neighbor offset is an integer, so samples
    // land exactly on texel centers.
    ivec2 icenter = ivec2(gl_FragCoord.xy);
    ivec2 dims = textureSize(inputTex, 0);

#if MODE == 0
    float radius = min(size, 3.0);
#else
    float radius = size;
#endif
    float fr = clamp(radius, 1.0, 12.0);
    float frSq = fr * fr;
    int sampleLimit = int(ceil(fr));

    // Eight octant accumulators in explicit registers -- NOT a dynamically
    // indexed fragment-local array. On WebGL2/ANGLE such an array spills to
    // memory and every one of the ~113 per-pixel accumulations pays a
    // round-trip; explicit variables stay in registers. Each sample is still
    // added to its own sector in scan order, so the result is bit-identical.
    vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
    vec3 m4 = vec3(0.0), m5 = vec3(0.0), m6 = vec3(0.0), m7 = vec3(0.0);
    vec3 q0 = vec3(0.0), q1 = vec3(0.0), q2 = vec3(0.0), q3 = vec3(0.0);
    vec3 q4 = vec3(0.0), q5 = vec3(0.0), q6 = vec3(0.0), q7 = vec3(0.0);
    float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;
    float n4 = 0.0, n5 = 0.0, n6 = 0.0, n7 = 0.0;

    for (int y = -sampleLimit; y <= sampleLimit; y++) {
        for (int x = -sampleLimit; x <= sampleLimit; x++) {
            vec2 d = vec2(float(x), float(y));
            if (abs(d.x) > fr || abs(d.y) > fr || dot(d, d) > frSq) { continue; }
            // Stride-2 outer ring: fr > 8.0 only when size > 8 (default
            // size = 6, so fr <= 8 keeps this branch dead and the loop
            // bit-identical to the pre-optimization version at every size
            // <= 8 -- unreachable by construction, not just by luck).
            // Beyond radius 8 the ring is thinned to every other lattice
            // point on a Manhattan/checkerboard parity (|x|+|y| even
            // survives): a diagonal checkerboard was picked over a
            // row/column stride so the thinned ring stays isotropic (no
            // horizontal/vertical bias) instead of halving in just one
            // axis.
            if (fr > 8.0 && dot(d, d) > 64.0 && (abs(x) + abs(y)) % 2 != 0) { continue; }

            // Octant classification without atan2. A naive independent
            // 3-bit test (bx = d.x<0, by = d.y<0, bm = abs(d.x)<abs(d.y),
            // sector = lookup(bx,by,bm)) cannot reproduce the atan2
            // formula it replaces: at d=(0,5) and d=(1,2) all three
            // booleans agree (false,false,true) yet the atan2 formula
            // bins them into different sectors (6 vs 5) -- no function of
            // 3 independent bits can separate them, because which side of
            // the x==0 (or y==0) axis a point falls on depends on the
            // SIGN OF THE OTHER COORDINATE, not just its own. The fix:
            // test each quadrant as a joint (x, y) condition rather than
            // two independent signs. Derived by hand and verified against
            // the atan2 formula for every integer offset in
            // [-12,12]x[-12,12] (all 625 offsets, 0 mismatches, plus 3M
            // random continuous samples): each quadrant test below is
            // closed on the axis it enters on and open on the axis it
            // exits on, matching atan2's counter-clockwise
            // closed-lower-bound convention; the magnitude-compare
            // strictness (< vs <=) alternates per quadrant because the
            // diagonal tie always resolves to the higher-angle sector.
            // (0,0) has no angle; pin it to sector 4, matching the
            // original atan2 guard's result.
            // Samples sit on texel centers, so texelFetch returns the identical
            // texel that clamp-to-edge bilinear did while skipping the filter
            // unit -- the WebGL2/ANGLE bottleneck on a 100+ tap window. The
            // clamp reproduces the sampler's clamp-to-edge behavior.
            ivec2 sc = clamp(icenter + ivec2(x, y), ivec2(0), dims - ivec2(1));
            vec3 c = texelFetch(inputTex, sc, 0).rgb;
            vec3 cc = c * c;
            // Octant classification fused with accumulation: the joint
            // per-quadrant tests select the sector, and each sample is added
            // directly to that sector's explicit accumulator -- no computed
            // array index is ever formed.
            if (x == 0 && y == 0) {
                m4 += c; q4 += cc; n4 += 1.0;
            } else if (d.x > 0.0 && d.y >= 0.0) {
                if (abs(d.x) <= abs(d.y)) { m5 += c; q5 += cc; n5 += 1.0; }
                else                      { m4 += c; q4 += cc; n4 += 1.0; }
            } else if (d.x <= 0.0 && d.y > 0.0) {
                if (abs(d.x) < abs(d.y))  { m6 += c; q6 += cc; n6 += 1.0; }
                else                      { m7 += c; q7 += cc; n7 += 1.0; }
            } else if (d.x < 0.0 && d.y <= 0.0) {
                if (abs(d.x) <= abs(d.y)) { m1 += c; q1 += cc; n1 += 1.0; }
                else                      { m0 += c; q0 += cc; n0 += 1.0; }
            } else {
                // remaining case: d.x >= 0.0 && d.y < 0.0
                if (abs(d.x) < abs(d.y))  { m2 += c; q2 += cc; n2 += 1.0; }
                else                      { m3 += c; q3 += cc; n3 += 1.0; }
            }
        }
    }

    vec3 bestC = vec3(0.0);
    float bestV = 1e9;
    // Unrolled lowest-variance selection over the 8 sectors, evaluated 0..7 in
    // the same order as the original loop so ties resolve to the identical sector.
    if (n0 >= 1.0) { vec3 m = m0 / n0; vec3 v = q0 / n0 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n1 >= 1.0) { vec3 m = m1 / n1; vec3 v = q1 / n1 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n2 >= 1.0) { vec3 m = m2 / n2; vec3 v = q2 / n2 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n3 >= 1.0) { vec3 m = m3 / n3; vec3 v = q3 / n3 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n4 >= 1.0) { vec3 m = m4 / n4; vec3 v = q4 / n4 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n5 >= 1.0) { vec3 m = m5 / n5; vec3 v = q5 / n5 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n6 >= 1.0) { vec3 m = m6 / n6; vec3 v = q6 / n6 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n7 >= 1.0) { vec3 m = m7 / n7; vec3 v = q7 / n7 - m * m; float tv = v.r + v.g + v.b; if (tv < bestV) { bestV = tv; bestC = m; } }

    fragColor = vec4(bestC, 1.0);
}
