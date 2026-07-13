/*
 * Extrude - classic block/pyramid extrusion toward the viewer.
 * See extrude.glsl for the full algorithm, occlusion-ordering, and
 * shading derivation - this is a 1:1 port.
 *
 * Tile-aware, mirroring extrude.glsl: P = pos.xy + uniforms.tileOffset is
 * the GLOBAL fragment position (GLSL's gl_FragCoord.xy + tileOffset), and
 * imgCenter = fullResolution*0.5 is the GLOBAL image center (falling back
 * to the local textureDimensions(inputTex) size when fullResolution is
 * unset, i.e. uniforms.fullResolution.x <= 0.0 - matching filter/texture's
 * guard). Every downstream position in this file (cellC, faceCenter,
 * apex, the pyramid corners, localPos, ...) is derived from P and
 * imgCenter, so fixing just those two root values keeps the whole
 * grid/occlusion/apex geometry globally consistent across tile
 * boundaries. toSampleUV converts a GLOBAL position back to a tile-LOCAL
 * sample UV (subtract uniforms.tileOffset, divide by the local
 * textureDimensions(inputTex)) before ever touching inputTex, matching
 * GLSL's toSampleUV(globalPixelPos) = (globalPixelPos - tileOffset) /
 * resolution - inputTex only ever holds this tile's own crop, so every
 * texture read must land back in tile-local space even though the
 * geometry that produced it is computed globally. Default (non-tiled)
 * rendering has uniforms.tileOffset = (0,0) and uniforms.fullResolution
 * == textureDimensions(inputTex), so P and imgCenter reduce to their
 * pre-tiling values exactly (pos.xy and texSize*0.5) - byte-identical
 * output, zero regression by construction. No centerY-style flip is
 * needed for imgCenter itself (fullResolution*0.5 is symmetric
 * regardless of Y convention).
 *
 * TOP_SIGN = 1.0 here, SAME as GLSL: the two backends were verified
 * only as mutually consistent with each other - bit-exact
 * cross-backend parity, nothing more. This algorithm is
 * flip-symmetric (center-anchored grid; a global Y-mirror is a
 * self-consistent relabeling), so that parity CANNOT determine the
 * absolute orientation: which way is visually "up" for the side
 * shading was never independently verified, and it is cosmetically
 * irrelevant here - left/right facets are unaffected, and a global
 * flip would swap top/bottom facet shading only. Effects with
 * genuinely Y-asymmetric semantics must NOT inherit an orientation
 * claim from this file; they need their own discriminating test (see
 * spinBlur's centerY fix for the pattern).
 */

struct Uniforms {
    size: f32,
    depth: f32,
    solidFront: i32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TOP_SIGN: f32 = 1.0;

const SHADE_TOP: f32 = 0.8875;
const SHADE_BOTTOM: f32 = 0.6625;
const SHADE_LEFT: f32 = 0.969856;
const SHADE_RIGHT: f32 = 0.580144;

const EPS: f32 = 1e-4;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn toSampleUV(globalPixelPos: vec2<f32>, texSize: vec2<f32>) -> vec2<f32> {
    return clamp((globalPixelPos - uniforms.tileOffset) / texSize, vec2<f32>(0.0), vec2<f32>(1.0));
}

// Small 3x3 average centered on a cell, spaced at size*0.25 so the full
// sample footprint (size*0.5 wide) stays inside the cell's own bounds.
//
// textureSampleLevel (explicit LOD 0), not textureSample: this function
// is called from the occlusion-walk loop in main(), whose iteration
// count is genuinely per-fragment data-dependent (it breaks at
// `t >= distToCenter`, and distToCenter varies with each fragment's own
// position) - non-uniform control flow, which disqualifies plain
// textureSample (it needs implicit derivatives / uniform control flow).
// inputTex is a non-mipmapped render-target-style texture, so LOD 0 is
// exactly GLSL's texture() here. Mirrors synth/remap's WGSL port.
fn cellAvgColor3x3(centerPx: vec2<f32>, texSize: vec2<f32>) -> vec4<f32> {
    let sp = uniforms.size * 0.25;
    var sum = vec4<f32>(0.0);
    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let p = centerPx + vec2<f32>(f32(i), f32(j)) * sp;
            sum = sum + textureSampleLevel(inputTex, inputSampler, toSampleUV(p, texSize), 0.0);
        }
    }
    return sum * (1.0 / 9.0);
}

fn cellHeight(cellC: vec2<f32>, cellIdxF: vec2<f32>, texSize: vec2<f32>) -> f32 {
    if (DEPTH_SOURCE == 1) {
        // Hash the cell index directly - both backends' fragment
        // positions are content-Y-up in this runtime (see header), so
        // the center-anchored cell indices are already identical
        // cross-backend for the same visual cell.
        return hash12(cellIdxF);
    }
    return lum(cellAvgColor3x3(cellC, texSize).rgb);
}

// Barycentric coords of p in triangle (a,b,c); w (.z) corresponds to c.
// Returns a component < -1.0 (impossible for a real barycentric coord)
// when the triangle is degenerate, so callers can treat it as a miss
// with the same ">= -EPS" containment test used for real triangles.
fn baryWeights(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, c: vec2<f32>) -> vec3<f32> {
    let v0 = b - a;
    let v1 = c - a;
    let v2 = p - a;
    let d00 = dot(v0, v0);
    let d01 = dot(v0, v1);
    let d11 = dot(v1, v1);
    let d20 = dot(v2, v0);
    let d21 = dot(v2, v1);
    let denom = d00 * d11 - d01 * d01;
    if (abs(denom) < 1e-8) {
        return vec3<f32>(-2.0);
    }
    let v = (d11 * d20 - d01 * d21) / denom;
    let w = (d00 * d21 - d01 * d20) / denom;
    let u = 1.0 - v - w;
    return vec3<f32>(u, v, w);
}

// -1 if P misses all 4 faces; else 0=bottom,1=right,2=top,3=left (fixed
// per-triangle identity, independent of where apex actually projects to
// - see extrude.glsl's FACE COLOR / SHADING note).
fn pyramidTriHit(P: vec2<f32>, cellC: vec2<f32>, apex: vec2<f32>, halfCell: vec2<f32>) -> i32 {
    let topC = cellC + TOP_SIGN * vec2<f32>(0.0, halfCell.y);
    let botC = cellC - TOP_SIGN * vec2<f32>(0.0, halfCell.y);
    let leftX = cellC.x - halfCell.x;
    let rightX = cellC.x + halfCell.x;
    let Cbl = vec2<f32>(leftX, botC.y);
    let Cbr = vec2<f32>(rightX, botC.y);
    let Ctr = vec2<f32>(rightX, topC.y);
    let Ctl = vec2<f32>(leftX, topC.y);

    var bc = baryWeights(P, Cbl, Cbr, apex);
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
fn sideShade(P: vec2<f32>, cellC: vec2<f32>) -> f32 {
    let d = P - cellC;
    let dyUp = d.y * TOP_SIGN;
    if (abs(d.x) > abs(dyUp)) {
        return select(SHADE_LEFT, SHADE_RIGHT, d.x > 0.0);
    }
    return select(SHADE_BOTTOM, SHADE_TOP, dyUp > 0.0);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var globalRes: vec2<f32> = texSize;
    if (uniforms.fullResolution.x > 0.0) { globalRes = uniforms.fullResolution; }
    let P = pos.xy + uniforms.tileOffset;
    let imgCenter = globalRes * 0.5;
    let halfCell = vec2<f32>(uniforms.size * 0.5);

    let toCenter = imgCenter - P;
    let distToCenter = length(toCenter);
    var stepDir = vec2<f32>(0.0);
    if (distToCenter > 0.0) {
        stepDir = toCenter / distToCenter;
    }

    var bestPriority: f32 = -1.0e9;
    var bestCenterPx = vec2<f32>(0.0);
    var bestS: f32 = 1.0;
    var bestIsTop = false;
    var bestTri: i32 = -1;
    var found = false;

    for (var i = 0; i < 6; i++) {
        let t = min(f32(i) * uniforms.size, distToCenter);
        let samplePos = P + stepDir * t;
        // Center-anchored grid - see extrude.glsl's header for why
        // (cross-backend origin-anchoring mismatch).
        let cellIdxF = floor((samplePos - imgCenter) / uniforms.size);
        let cellC = imgCenter + (cellIdxF + 0.5) * uniforms.size;

        let h = cellHeight(cellC, cellIdxF, texSize);
        let s = 1.0 + h * (uniforms.depth / 100.0) * 0.4;

        if (EXTRUDE_TYPE == 1) {
            // pyramids: priority is s alone (no flat-top tier).
            let apex = imgCenter + (cellC - imgCenter) * s;
            let tri = pyramidTriHit(P, cellC, apex, halfCell);
            if (tri >= 0 && s > bestPriority) {
                bestPriority = s;
                bestCenterPx = cellC;
                bestS = s;
                bestTri = tri;
                found = true;
            }
        } else {
            // blocks: top face is the footprint scaled by s about the
            // image center; side band is the rest of the un-scaled
            // footprint (only ever true for i==0 - see header).
            let faceCenter = imgCenter + (cellC - imgCenter) * s;
            let faceHalf = halfCell * s;
            let topHit = all(abs(P - faceCenter) <= faceHalf);
            let sideHit = (!topHit) && all(abs(P - cellC) <= halfCell);
            if (topHit || sideHit) {
                let priority = s + select(0.0, 1000.0, topHit);
                if (priority > bestPriority) {
                    bestPriority = priority;
                    bestCenterPx = cellC;
                    bestS = s;
                    bestIsTop = topHit;
                    found = true;
                }
            }
        }

        if (t >= distToCenter) { break; }
    }

    var outColor: vec4<f32>;
    if (!found) {
        // Safety net: P's own cell should always produce a hit by
        // construction (see extrude.glsl header); this only guards
        // float-precision edge cases exactly on a cell boundary, so it
        // never shows up as a visible crack.
        let cellC = imgCenter + (floor((P - imgCenter) / uniforms.size) + 0.5) * uniforms.size;
        outColor = cellAvgColor3x3(cellC, texSize);
    } else if (EXTRUDE_TYPE == 1) {
        let apex = imgCenter + (bestCenterPx - imgCenter) * bestS;
        let topC = bestCenterPx + TOP_SIGN * vec2<f32>(0.0, halfCell.y);
        let botC = bestCenterPx - TOP_SIGN * vec2<f32>(0.0, halfCell.y);
        let leftX = bestCenterPx.x - halfCell.x;
        let rightX = bestCenterPx.x + halfCell.x;
        let Cbl = vec2<f32>(leftX, botC.y);
        let Cbr = vec2<f32>(rightX, botC.y);
        let Ctr = vec2<f32>(rightX, topC.y);
        let Ctl = vec2<f32>(leftX, topC.y);

        var Ci: vec2<f32>;
        var Ci1: vec2<f32>;
        var shadeConst: f32;
        if (bestTri == 0) { Ci = Cbl; Ci1 = Cbr; shadeConst = SHADE_BOTTOM; }
        else if (bestTri == 1) { Ci = Cbr; Ci1 = Ctr; shadeConst = SHADE_RIGHT; }
        else if (bestTri == 2) { Ci = Ctr; Ci1 = Ctl; shadeConst = SHADE_TOP; }
        else { Ci = Ctl; Ci1 = Cbl; shadeConst = SHADE_LEFT; }

        let bc = baryWeights(P, Ci, Ci1, apex);
        let apexW = clamp(bc.z, 0.0, 1.0);

        var baseColor: vec4<f32>;
        if (uniforms.solidFront != 0) {
            baseColor = cellAvgColor3x3(bestCenterPx, texSize);
        } else {
            let localPos = bc.x * Ci + bc.y * Ci1 + bc.z * bestCenterPx;
            // Explicit LOD - see cellAvgColor3x3's comment (same non-uniform-control-flow reasoning).
            baseColor = textureSampleLevel(inputTex, inputSampler, toSampleUV(localPos, texSize), 0.0);
        }
        let shade = mix(1.0, shadeConst, apexW);
        outColor = vec4<f32>(baseColor.rgb * shade, baseColor.a);
    } else if (bestIsTop) {
        if (uniforms.solidFront != 0) {
            outColor = cellAvgColor3x3(bestCenterPx, texSize);
        } else {
            let localPos = imgCenter + (P - imgCenter) / bestS;
            // Explicit LOD - see cellAvgColor3x3's comment (same non-uniform-control-flow reasoning).
            outColor = textureSampleLevel(inputTex, inputSampler, toSampleUV(localPos, texSize), 0.0);
        }
    } else {
        let shade = sideShade(P, bestCenterPx);
        let meanColor = cellAvgColor3x3(bestCenterPx, texSize);
        outColor = vec4<f32>(meanColor.rgb * shade, meanColor.a);
    }

    return outColor;
}
