/*
 * Patchwork - needlepoint grid of solid-color squares raised by luminance
 * with lit bevel edges.
 *
 * GRID: cells are squareSize-px squares in GLOBAL (tile-aware) pixel
 * coordinates, anchored at the IMAGE CENTER
 * (cellIdxF = floor((globalCoord - imgCenter) / squareSize)), NOT at the
 * coordinate origin. This is filter/extrude's proven fix for a real
 * cross-backend bug: an origin-anchored grid lands its cell boundaries
 * (fullResolution mod squareSize) pixels apart between GLSL and WGSL
 * whenever the image dimension is not an exact multiple of squareSize
 * (see extrude.glsl's header for the empirical proof - an 11.4%
 * cross-backend pixel mismatch was measured before that fix). A
 * center-anchored grid is mirror-symmetric about the image center, so
 * both backends land on the identical grid regardless of resolution.
 *
 * CELL COLOR / HEIGHT: each cell is SOLID - one color per cell, sampled
 * with a 3x3 mini-blur at the cell's own center (filter/extrude's
 * cellAvgColor3x3 precedent: 9 taps spaced at squareSize*0.25 px, so the
 * full sample footprint stays inside the cell's own bounds, never
 * leaking into a neighbor). Height h = lum(cellColor) (luminance).
 *
 * TOP FACE: every pixel (interior AND rim) is shaded by its OWN cell's
 * height alone: topFaceShade = 0.9 + 0.2*(h-0.5), i.e. brighter cells
 * read very slightly brighter (range [0.8, 1.0] for h in [0,1]) - the
 * flat "fabric" shading of the square's face. The rim never blends in
 * the neighbor's actual color, only modulates brightness (see BEVEL RIM).
 *
 * BEVEL RIM: the outer 15% of each cell (rimPx = 0.15*squareSize, on
 * EVERY side) is additionally beveled. A rim pixel's nearest edge (min of
 * the 4 distances-to-edge, in cell-local px) picks ONE neighbor cell
 * (left/right/top/bottom - exact ties, a measure-zero case only possible
 * exactly on a corner diagonal, resolve to a fixed priority order via the
 * if/else-if chain below, which both backends evaluate identically) and
 * a matching axis-aligned unit edgeNormal: left=(-1,0), right=(1,0),
 * bottom=(0,-1), top=(0,1).
 *
 * This is a deliberately different construction from filter/relief's reliefShade
 * (used by filter/craquelure and filter/mosaicTiles): relief shading differentiates a
 * CONTINUOUS height field to get a local gradient/normal, but patchwork's
 * height field is a piecewise-CONSTANT step function - every within-cell
 * neighbor sample (e.g. gc+-1px, the usual central-difference taps)
 * returns the SAME cell's height until you cross clear into the next
 * cell, so a 1-2px finite-difference gradient is either exactly zero (not
 * at a cell boundary) or an undersized step (right at one) - it cannot
 * represent "this whole 15%-wide rim band bevels toward cell X's TRUE
 * total height difference". Instead the bevel is built directly and
 * analytically from the CELL-TO-CELL height difference and the light
 * angle:
 *
 *   dh = h(this) - h(neighbor)
 *   a = radians(lightAngle); lightDir = vec2(cos(a), sin(a))  (already
 *       unit length: cos^2+sin^2=1, so no normalize() needed)
 *   signTerm = dot(edgeNormal, lightDir)                       in [-1,1]
 *   bevelMul = 1 + 0.35*(relief/100) * sign(dh) * signTerm
 *
 * POLARITY DERIVATION (raised cells - opposite of craquelure's carved
 * groove): treat h as an actual
 * height field and use the standard height-field normal convention
 * normal = normalize(-dh/dx, -dh/dy, 1) (relief shading uses this same convention).
 * A rim band physically ramps from the NEIGHBOR's height at the cell
 * border to THIS cell's own height at the rim's inner edge (where it
 * meets the flat top face). Take the left rim (edgeNormal=(-1,0),
 * border at local x=0, inner rim boundary at local x=rimPx) with
 * dh = h(this)-h(neighbor) > 0 (this cell raised relative to its left
 * neighbor): height rises from h(neighbor) at x=0 to h(this) at
 * x=rimPx, i.e. dh/dx > 0 over the band, so normal.x = -dh/dx < 0 - the
 * bevel face leans toward -x, i.e. it aligns with edgeNormal=(-1,0)
 * itself. Redo with dh < 0 (this cell LOWER than its left neighbor): the
 * band now falls from x=0 to x=rimPx, dh/dx < 0, normal.x > 0 - the face
 * leans toward +x, i.e. it aligns with -edgeNormal. Both cases combine to
 * "bevel-face direction = edgeNormal * sign(dh)", so
 * dot(edgeNormal, lightDir) * sign(dh) is exactly the Lambertian-style
 * facing term for that leaning face - the formula above.
 *
 * Raised-face polarity check: a square lit from upper-left has its
 * top/left bevel faces bright and
 * bottom/right faces dark"): at lightAngle=135, lightDir =
 * (cos135,sin135) = (-0.707,+0.707) (screen-up convention - see
 * ORIENTATION below). For a cell raised relative to ALL 4 neighbors
 * (dh>0 on every side, e.g. a locally-brightest cell): left
 * signTerm = dot((-1,0),lightDir) = +0.707 -> LIT; top
 * signTerm = dot((0,1),lightDir) = +0.707 -> LIT; right
 * signTerm = dot((1,0),lightDir) = -0.707 -> DARK; bottom
 * signTerm = dot((0,-1),lightDir) = -0.707 -> DARK. Top/left bright,
 * bottom/right dark. This is the OPPOSITE sign
 * convention from filter/craquelure's carved groove, which negates its
 * height (hC=-kC) before its own relief shading-routed shading specifically because
 * a groove is a dip, not a bump; patchwork's h is fed in DIRECTLY (never
 * negated) because cells are raised, not carved - the one sign flip
 * between the two effects is entirely that h-vs-(-h) choice, not any
 * difference in the light/normal machinery itself.
 *
 * INVARIANCES (true by construction, not just by testing):
 *   - relief=0: bevelMul = 1 + 0.35*0*(...) = 1.0 EXACTLY on every rim
 *     pixel, so the rim is indistinguishable from the interior (flat
 *     patchwork, no bevel).
 *   - Uniform source (flat ground): every cell's 3x3-blurred color is the
 *     same texel value, so h and hNeighbor are bit-identical floats and
 *     dh = h - hNeighbor = 0.0 exactly; GLSL's sign(0.0) = 0.0 by spec
 *     (not +-1), so bevelMul = 1.0 EXACTLY regardless of relief or
 *     lightAngle. No extra gating mask is needed here (contrast
 *     filter/craquelure's fix, which needed a wallMask gate because ITS
 *     relief shading-routed flat baseline is 0.6, not 0 - patchwork's bespoke formula
 *     is zero-centered by construction).
 *
 * ORIENTATION: edgeNormal/localPx/cellIdxF/imgCenter are all
 * POSITION-DERIVED (built from gl_FragCoord.xy/pos.xy). These use NO
 * manual Y compensation; the WebGPU present-time flip cancels the raw
 * Y-convention difference automatically, exactly like filter/extrude's
 * imgCenter anchoring and filter/spinBlur/pondRipples' offsets. lightDir
 * is a pure function of the lightAngle UNIFORM (not position-derived at
 * all), so it is textually IDENTICAL between GLSL and WGSL, matching
 * filter/relief's rlShade.glsl precedent (independently verified on
 * screen on both backends: lightAngle=135 reads upper-left,
 * lightAngle=-45 flips it to lower-right) - the same cos/sin(lightAngle)
 * construction is reused here without extra orientation compensation.
 *
 * ALPHA: sampled from the pixel's own (non-cell-averaged) position,
 * matching filter/mosaicTiles' srcHome / filter/craquelure's src
 * precedent.
 *
 * Single pass, no hash/noise anywhere - a deterministic integer grid, per
 * the algorithm (no hash, value noise, or Voronoi field needed).
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float squareSize;
uniform float relief;
uniform float lightAngle;

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// globalPixelPos is in GLOBAL pixel space; converts to a tile-local
// sample UV, clamped so the 3x3 mini-blur and neighbor-cell samples never
// read past this tile's own coverage.
vec2 toSampleUV(vec2 globalPixelPos) {
    return clamp((globalPixelPos - tileOffset) / resolution, 0.0, 1.0);
}

// 3x3 mini-blur centered on a cell (filter/extrude's cellAvgColor3x3
// precedent): spaced at squareSize*0.25 so the full sample footprint
// (squareSize*0.5 wide) stays inside the cell's own bounds.
vec4 cellAvgColor3x3(vec2 centerPx) {
    float sp = squareSize * 0.25;
    vec4 sum = vec4(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 p = centerPx + vec2(float(i), float(j)) * sp;
            sum += texture(inputTex, toSampleUV(p));
        }
    }
    return sum * (1.0 / 9.0);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 srcOwn = texture(inputTex, uv);

    // Center-anchored grid - see header for why.
    vec2 imgCenter = fullResolution * 0.5;
    vec2 relPx = globalCoord - imgCenter;
    vec2 cellIdxF = floor(relPx / squareSize);
    vec2 localPx = relPx - cellIdxF * squareSize;
    vec2 cellCenter = imgCenter + (cellIdxF + 0.5) * squareSize;

    vec3 cellColor = cellAvgColor3x3(cellCenter).rgb;
    float h = lum(cellColor);
    float topFaceShade = 0.9 + 0.2 * (h - 0.5);

    // Distance (px) from this rim pixel to each of the cell's 4 edges.
    float rimPx = 0.15 * squareSize;
    float dLeft = localPx.x;
    float dRight = squareSize - localPx.x;
    float dBottom = localPx.y;
    float dTop = squareSize - localPx.y;
    float dMin = min(min(dLeft, dRight), min(dBottom, dTop));

    float bevelMul = 1.0;
    if (dMin < rimPx) {
        vec2 neighborIdx = cellIdxF;
        vec2 edgeNormal;
        if (dMin == dLeft) {
            neighborIdx.x -= 1.0;
            edgeNormal = vec2(-1.0, 0.0);
        } else if (dMin == dRight) {
            neighborIdx.x += 1.0;
            edgeNormal = vec2(1.0, 0.0);
        } else if (dMin == dBottom) {
            neighborIdx.y -= 1.0;
            edgeNormal = vec2(0.0, -1.0);
        } else {
            neighborIdx.y += 1.0;
            edgeNormal = vec2(0.0, 1.0);
        }

        vec2 neighborCenter = imgCenter + (neighborIdx + 0.5) * squareSize;
        float hNeighbor = lum(cellAvgColor3x3(neighborCenter).rgb);
        float dh = h - hNeighbor;

        float a = radians(lightAngle);
        vec2 lightDir = vec2(cos(a), sin(a));
        float signTerm = dot(edgeNormal, lightDir);

        // See POLARITY DERIVATION above.
        bevelMul = 1.0 + 0.35 * (relief / 100.0) * sign(dh) * signTerm;
    }

    vec3 result = clamp(cellColor * topFaceShade * bevelMul, 0.0, 1.0);
    fragColor = vec4(result, srcOwn.a);
}
