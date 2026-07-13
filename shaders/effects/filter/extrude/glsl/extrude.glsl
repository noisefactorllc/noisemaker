/*
 * Extrude - classic block/pyramid extrusion toward the viewer.
 *
 * The image is divided into a `size`x`size`-pixel grid using tile-aware
 * GLOBAL pixel coordinates (gl_FragCoord + tileOffset), so the grid is
 * stable across CLI tile boundaries. The grid is ANCHORED AT THE IMAGE
 * CENTER (cell index = floor((pos - imgCenter)/size)), not at the
 * framebuffer origin: GLSL's origin is the bottom-left corner while
 * WGSL's is the top-left, so an origin-anchored grid lands its
 * horizontal boundaries (fullResolution.y mod size) pixels apart between
 * the two backends whenever the height is not an exact multiple of size
 * (proven empirically: an 11.4% cross-backend pixel mismatch at
 * 1024px/size=24, with mismatched pixels differing by exactly the ratio
 * of two SHADE_* constants - the same pixel classifying onto
 * differently-shaded faces). A center-anchored grid is mirror-symmetric
 * about the image center, so both backends see the identical visual
 * grid - and it is also the natural anchor for an effect whose entire
 * geometry radiates from the image center. Each cell has a height h in
 * [0,1]: depthSource luminance uses a small 3x3 average sample at the
 * cell center (luminance luminance of that average); depthSource
 * random uses hash12(cellId), where cellId is the GLOBAL center-relative
 * cell index, so the hash is identical for a given cell regardless of
 * which tile is rendering it - tile-aware by construction. (The WGSL
 * port hashes the same index unchanged: in this runtime both backends'
 * fragment positions are content-Y-up, so the center-anchored cell
 * indices already coincide cross-backend - see extrude.wgsl's header.)
 *
 * Each cell's height maps to a scale factor s = 1 + h*(depth/100)*0.4
 * (s in [1, 1.4] at depth=100).
 *
 * blocks: the cell's square footprint, scaled by s ABOUT THE IMAGE
 * CENTER, is its projected top face - both the offset from center and
 * the face's own half-size grow by s, so taller cells both shift outward
 * AND enlarge: the classic "leaning toward the viewer, more so near the
 * frame edges" perspective-from-center look.
 *
 * pyramids: only the apex point (cell center scaled by s about the image
 * center) projects; the 4 side faces are triangles fanned from the
 * ORIGINAL (unscaled) footprint's 4 corners to that single projected
 * apex point.
 *
 * OCCLUSION ORDERING (why we walk toward the center, and why "top beats
 * side, else highest s wins"):
 *
 * Scaling a footprint about the image center by s>=1 only ever moves it
 * AWAY from the center. So the only cells whose PROJECTED face can ever
 * reach a given pixel P are: P's own cell, and cells strictly closer to
 * the image center than P (their scaled face can stretch out far enough
 * to cover P; cells farther out than P geometrically cannot reach back
 * in - their faces only move further away from P). We walk from P's own
 * cell toward the center, one cell-width at a time, for up to 6 steps
 * (bounded), and test each candidate.
 *
 * A cell's UN-scaled footprint can only ever contain pixels literally
 * inside that one cell (cells tile the plane without overlap), so a
 * "side-band" hit (pixel inside a cell's original footprint but outside
 * that SAME cell's scaled top face) can only ever occur for the walk's
 * distance-0 candidate (P's own cell) - every other candidate can only
 * ever contribute a top-face hit. Physically, any point on any block's
 * flat top face sits nearer the viewer (full extrusion height) than any
 * point on any side wall (which ramps from the footprint back up to the
 * top), so ties are broken: any top-face hit beats any side-band hit;
 * among top-face hits, the highest s (tallest / nearest the viewer)
 * wins, matching "nearer blocks occlude farther ones". Implemented as
 * one scalar priority = s + (isTop ? 1000.0 : 0.0), kept as a running
 * max while walking candidates - this naturally implements "test in
 * order of decreasing effective s, nearest-to-viewer wins" without an
 * explicit sort, since every candidate's priority is compared against
 * the running best so far.
 *
 * pyramids have no flat top tier (the apex is a single point), so every
 * hit is a "side" (slant-face) hit and priority is s alone.
 *
 * FACE COLOR / SHADING:
 * - blocks top face: solidFront ? cell-mean color : image resampled at
 *   the un-projected position (inverse of the "scale about center by s"
 *   map: localPos = imgCenter + (P-imgCenter)/s) - a "window" onto the
 *   original picture, unshaded (it is the flat, viewer-facing cap).
 * - blocks side band: ALWAYS the cell-mean color (never maps
 *   image content onto a block's side walls, solidFront or not), times a
 *   per-side facing shade from a fixed simulated light (see SHADE_*
 *   below), chosen by whichever of left/right/top/bottom the pixel sits
 *   nearest to (simple |dx| vs |dy| quadrant split around the cell
 *   center).
 * - pyramids: every visible pixel is on one of the 4 slant faces, so
 *   solidFront toggles the same base (mean color vs. the barycentric
 *   un-projection of the winning triangle back onto the original
 *   corner+corner+cell-center triangle - apex unprojects to the cell
 *   center, since apex = cellCenter*s), and the facing shade is ALWAYS
 *   applied on top: mix(1.0, sideShadeConstant, apexBarycentricWeight) -
 *   full brightness at the (undisplaced) base edge, fading to the face's
 *   characteristic shade at the tip. This is barycentric-like side
 *   shading. solidFront applies the same way, so it
 *   is the identical mean-vs-image toggle as blocks, just applied to a
 *   surface that is always shaded (pyramids have no unshaded flat cap).
 *
 * SHADE_* constants: simulated light from angle 150 degrees (standard
 * math convention: 0=+X/right, 90=+Y/up - i.e. mostly from the left,
 * slightly above), facing = dot(sideNormal, lightDir)*0.5+0.5, shade =
 * 0.55 + 0.45*facing. Precomputed here (GLSL
 * has no constant-expression sin/cos): left=0.969856 (brightest),
 * top=0.8875, bottom=0.6625, right=0.580144 (darkest) - four clearly
 * distinct facets, chosen over a symmetric 45/135-degree light so all
 * four sides read as visually different (the acceptance bar).
 *
 * Y ORIENTATION: GLSL and WGSL share a single TOP_SIGN constant,
 * verified only as mutually consistent between the two backends -
 * bit-exact cross-backend parity, nothing more. This algorithm is
 * flip-symmetric (center-anchored grid; a global Y-mirror is a
 * self-consistent relabeling), so that parity CANNOT determine the
 * absolute orientation: which way is visually "up" for the side
 * shading was never independently verified, and it is cosmetically
 * irrelevant here - left/right facets are unaffected, and a global
 * flip would swap top/bottom facet shading only. Effects with
 * genuinely Y-asymmetric semantics must NOT inherit an orientation
 * claim from this file; they need their own discriminating test (see
 * spinBlur's centerY fix for the pattern).
 *
 * ZERO-GUARD NOTE (depth=0): s=1 for every cell regardless of height, so
 * blocks' top face exactly reproduces the original footprint - every
 * pixel is a topHit on its own cell. With solidFront=false this is a
 * bit-exact passthrough (localPos = P exactly, s=1). With the SHIPPED
 * DEFAULT solidFront=true, depth=0 is NOT a passthrough - it settles
 * into flat per-cell mean-color posterization (Mosaic-alike), which is
 * the documented, intended resting state of this effect at its defaults,
 * not a bug. pyramids at depth=0 similarly degenerate to apex =
 * cellCenter, which splits every cell into 4 exact quarter-triangles
 * (the classic "connect center to all 4 corners" square decomposition) -
 * so even at depth=0, solidFront=true pyramids show a faceted radial-
 * gradient pattern per cell (never flat), because pyramids have no
 * flat-top tier at any depth. Both are intentional, documented per-mode
 * zero states, not passthroughs.
 */

#ifdef GL_ES
precision highp float;
#endif

// EXTRUDE_TYPE is a compile-time define injected by the runtime (see
// definition.js `globals.type.define`). blocks and pyramids use fully
// distinct hit-test and shading code, so baking the selector lets the
// compiler drop the unused variant entirely instead of branching on it
// per pixel.
#ifndef EXTRUDE_TYPE
#define EXTRUDE_TYPE 0
#endif

// DEPTH_SOURCE is a compile-time define injected by the runtime (see
// definition.js `globals.depthSource.define`). luminance samples a 3x3
// texture average per candidate cell inside the occlusion-walk loop;
// random only hashes the cell index. Baking the selector lets the
// random variant skip all texture sampling in that loop.
#ifndef DEPTH_SOURCE
#define DEPTH_SOURCE 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float size;
uniform float depth;
uniform bool solidFront;

out vec4 fragColor;

// See "Y ORIENTATION" above.
const float TOP_SIGN = 1.0;

// See "SHADE_* constants" above.
const float SHADE_TOP = 0.8875;
const float SHADE_BOTTOM = 0.6625;
const float SHADE_LEFT = 0.969856;
const float SHADE_RIGHT = 0.580144;

const float EPS = 1e-4;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// globalPixelPos is in GLOBAL pixel space; converts to a tile-local
// sample UV, clamped so wrap/edge cases never sample past this tile.
vec2 toSampleUV(vec2 globalPixelPos) {
    return clamp((globalPixelPos - tileOffset) / resolution, 0.0, 1.0);
}

// Small 3x3 average centered on a cell, spaced at size*0.25 so the full
// sample footprint (size*0.5 wide) stays inside the cell's own bounds.
vec4 cellAvgColor3x3(vec2 centerPx) {
    float sp = size * 0.25;
    vec4 sum = vec4(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 p = centerPx + vec2(float(i), float(j)) * sp;
            sum += texture(inputTex, toSampleUV(p));
        }
    }
    return sum * (1.0 / 9.0);
}

float cellHeight(vec2 cellC, vec2 cellIdxF) {
#if DEPTH_SOURCE==1
    return hash12(cellIdxF);
#else
    return lum(cellAvgColor3x3(cellC).rgb);
#endif
}

// Barycentric coords of p in triangle (a,b,c); w (.z) corresponds to c.
// Returns a component < -1.0 (impossible for a real barycentric coord)
// when the triangle is degenerate, so callers can treat it as a miss
// with the same ">= -EPS" containment test used for real triangles.
vec3 baryWeights(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 v0 = b - a;
    vec2 v1 = c - a;
    vec2 v2 = p - a;
    float d00 = dot(v0, v0);
    float d01 = dot(v0, v1);
    float d11 = dot(v1, v1);
    float d20 = dot(v2, v0);
    float d21 = dot(v2, v1);
    float denom = d00 * d11 - d01 * d01;
    if (abs(denom) < 1e-8) {
        return vec3(-2.0);
    }
    float v = (d11 * d20 - d01 * d21) / denom;
    float w = (d00 * d21 - d01 * d20) / denom;
    float u = 1.0 - v - w;
    return vec3(u, v, w);
}

// -1 if P misses all 4 faces; else 0=bottom,1=right,2=top,3=left (fixed
// per-triangle identity, independent of where apex actually projects to
// - see header's FACE COLOR / SHADING note).
int pyramidTriHit(vec2 P, vec2 cellC, vec2 apex, vec2 halfCell) {
    vec2 topC = cellC + TOP_SIGN * vec2(0.0, halfCell.y);
    vec2 botC = cellC - TOP_SIGN * vec2(0.0, halfCell.y);
    float leftX = cellC.x - halfCell.x;
    float rightX = cellC.x + halfCell.x;
    vec2 Cbl = vec2(leftX, botC.y);
    vec2 Cbr = vec2(rightX, botC.y);
    vec2 Ctr = vec2(rightX, topC.y);
    vec2 Ctl = vec2(leftX, topC.y);

    vec3 bc = baryWeights(P, Cbl, Cbr, apex);
    if (bc.x >= -EPS && bc.y >= -EPS && bc.z >= -EPS) { return 0; }
    bc = baryWeights(P, Cbr, Ctr, apex);
    if (bc.x >= -EPS && bc.y >= -EPS && bc.z >= -EPS) { return 1; }
    bc = baryWeights(P, Ctr, Ctl, apex);
    if (bc.x >= -EPS && bc.y >= -EPS && bc.z >= -EPS) { return 2; }
    bc = baryWeights(P, Ctl, Cbl, apex);
    if (bc.x >= -EPS && bc.y >= -EPS && bc.z >= -EPS) { return 3; }
    return -1;
}

// Which side of the cell (relative to its center) a footprint pixel is
// nearest to - a simple X-pattern quadrant split.
float sideShade(vec2 P, vec2 cellC) {
    vec2 d = P - cellC;
    float dyUp = d.y * TOP_SIGN;
    if (abs(d.x) > abs(dyUp)) {
        return (d.x > 0.0) ? SHADE_RIGHT : SHADE_LEFT;
    }
    return (dyUp > 0.0) ? SHADE_TOP : SHADE_BOTTOM;
}

void main() {
    vec2 P = gl_FragCoord.xy + tileOffset;
    vec2 imgCenter = fullResolution * 0.5;
    vec2 halfCell = vec2(size * 0.5);

    vec2 toCenter = imgCenter - P;
    float distToCenter = length(toCenter);
    vec2 stepDir = (distToCenter > 0.0) ? toCenter / distToCenter : vec2(0.0);

    float bestPriority = -1.0e9;
    vec2 bestCenterPx = vec2(0.0);
    float bestS = 1.0;
    bool bestIsTop = false;
    int bestTri = -1;
    bool found = false;

    for (int i = 0; i < 6; i++) {
        float t = min(float(i) * size, distToCenter);
        vec2 samplePos = P + stepDir * t;
        // Center-anchored grid - see header for why (cross-backend
        // origin-anchoring mismatch).
        vec2 cellIdxF = floor((samplePos - imgCenter) / size);
        vec2 cellC = imgCenter + (cellIdxF + 0.5) * size;

        float h = cellHeight(cellC, cellIdxF);
        float s = 1.0 + h * (depth / 100.0) * 0.4;

#if EXTRUDE_TYPE==1
        // pyramids: priority is s alone (no flat-top tier).
        vec2 apex = imgCenter + (cellC - imgCenter) * s;
        int tri = pyramidTriHit(P, cellC, apex, halfCell);
        if (tri >= 0 && s > bestPriority) {
            bestPriority = s;
            bestCenterPx = cellC;
            bestS = s;
            bestTri = tri;
            found = true;
        }
#else
        // blocks: top face is the footprint scaled by s about the
        // image center; side band is the rest of the un-scaled
        // footprint (only ever true for i==0 - see header).
        vec2 faceCenter = imgCenter + (cellC - imgCenter) * s;
        vec2 faceHalf = halfCell * s;
        bool topHit = all(lessThanEqual(abs(P - faceCenter), faceHalf));
        bool sideHit = (!topHit) && all(lessThanEqual(abs(P - cellC), halfCell));
        if (topHit || sideHit) {
            float priority = s + (topHit ? 1000.0 : 0.0);
            if (priority > bestPriority) {
                bestPriority = priority;
                bestCenterPx = cellC;
                bestS = s;
                bestIsTop = topHit;
                found = true;
            }
        }
#endif

        if (t >= distToCenter) { break; }
    }

    vec4 outColor;
    if (!found) {
        // Safety net: P's own cell should always produce a hit by
        // construction (see header); this only guards float-precision
        // edge cases exactly on a cell boundary, so it never shows up as
        // a visible crack.
        vec2 cellC = imgCenter + (floor((P - imgCenter) / size) + 0.5) * size;
        outColor = cellAvgColor3x3(cellC);
    } else {
#if EXTRUDE_TYPE==1
        vec2 apex = imgCenter + (bestCenterPx - imgCenter) * bestS;
        vec2 topC = bestCenterPx + TOP_SIGN * vec2(0.0, halfCell.y);
        vec2 botC = bestCenterPx - TOP_SIGN * vec2(0.0, halfCell.y);
        float leftX = bestCenterPx.x - halfCell.x;
        float rightX = bestCenterPx.x + halfCell.x;
        vec2 Cbl = vec2(leftX, botC.y);
        vec2 Cbr = vec2(rightX, botC.y);
        vec2 Ctr = vec2(rightX, topC.y);
        vec2 Ctl = vec2(leftX, topC.y);

        vec2 Ci, Ci1;
        float shadeConst;
        if (bestTri == 0) { Ci = Cbl; Ci1 = Cbr; shadeConst = SHADE_BOTTOM; }
        else if (bestTri == 1) { Ci = Cbr; Ci1 = Ctr; shadeConst = SHADE_RIGHT; }
        else if (bestTri == 2) { Ci = Ctr; Ci1 = Ctl; shadeConst = SHADE_TOP; }
        else { Ci = Ctl; Ci1 = Cbl; shadeConst = SHADE_LEFT; }

        vec3 bc = baryWeights(P, Ci, Ci1, apex);
        float apexW = clamp(bc.z, 0.0, 1.0);

        vec4 baseColor;
        if (solidFront) {
            baseColor = cellAvgColor3x3(bestCenterPx);
        } else {
            vec2 localPos = bc.x * Ci + bc.y * Ci1 + bc.z * bestCenterPx;
            baseColor = texture(inputTex, toSampleUV(localPos));
        }
        float shade = mix(1.0, shadeConst, apexW);
        outColor = vec4(baseColor.rgb * shade, baseColor.a);
#else
        if (bestIsTop) {
            if (solidFront) {
                outColor = cellAvgColor3x3(bestCenterPx);
            } else {
                vec2 localPos = imgCenter + (P - imgCenter) / bestS;
                outColor = texture(inputTex, toSampleUV(localPos));
            }
        } else {
            float shade = sideShade(P, bestCenterPx);
            vec4 meanColor = cellAvgColor3x3(bestCenterPx);
            outColor = vec4(meanColor.rgb * shade, meanColor.a);
        }
#endif
    }

    fragColor = outColor;
}
