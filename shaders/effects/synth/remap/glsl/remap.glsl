/**
 * Remap — GLSL fragment shader
 *
 * For each pixel, walks active zones (vertexCount >= 3 and source wired)
 * and tests whether the UV is inside the polygon. The first matching
 * zone wins; the pixel samples from that zone's wired source surface.
 * Pixels outside every active zone show the background color.
 *
 * Edge smoothing is applied as a soft alpha falloff at polygon boundaries
 * so adjacent zones blend instead of producing aliased seams.
 *
 * When warpEnabled is set, every output pixel is run through the inverse
 * of an 8-handle Coons-patch warp before zone-testing, so zones drawn in
 * the rectangular source space project onto the eight-handle quad.
 */

#ifdef GL_ES
precision highp float;
#endif

#define MAX_ZONES 8
#define MAX_VERTS_PER_ZONE 16
#define MAX_PAIRS 8  // MAX_VERTS_PER_ZONE / 2

// Auto-filled by the runtime — output framebuffer dimensions.
uniform vec2 resolution;

// Per-zone source surfaces. Wired in DSL via `zoneN_tex: read(oN)`.
uniform sampler2D zone0_tex;
uniform sampler2D zone1_tex;
uniform sampler2D zone2_tex;
uniform sampler2D zone3_tex;
uniform sampler2D zone4_tex;
uniform sampler2D zone5_tex;
uniform sampler2D zone6_tex;
uniform sampler2D zone7_tex;

uniform vec3 bgColor;
uniform float bgAlpha;
uniform int zoneCount;
uniform float smoothEdge;
uniform float time;

// === Geometry warp ===
uniform bool warpEnabled;
uniform vec2 warpCorner0;  // TL
uniform vec2 warpCorner1;  // TR
uniform vec2 warpCorner2;  // BR
uniform vec2 warpCorner3;  // BL
uniform vec2 warpMid0;     // T
uniform vec2 warpMid1;     // R
uniform vec2 warpMid2;     // B
uniform vec2 warpMid3;     // L

uniform int zone0_count; uniform int zone1_count; uniform int zone2_count; uniform int zone3_count;
uniform int zone4_count; uniform int zone5_count; uniform int zone6_count; uniform int zone7_count;

// Set to 1 by the runtime when zoneN_tex is wired to a real surface, else 0.
uniform int zone0_active; uniform int zone1_active; uniform int zone2_active; uniform int zone3_active;
uniform int zone4_active; uniform int zone5_active; uniform int zone6_active; uniform int zone7_active;

uniform float zone0_alpha; uniform float zone1_alpha; uniform float zone2_alpha; uniform float zone3_alpha;
uniform float zone4_alpha; uniform float zone5_alpha; uniform float zone6_alpha; uniform float zone7_alpha;

// Each zoneN_vP is (vert 2P.xy, vert 2P+1.xy) — eight pairs cover MAX_VERTS_PER_ZONE.
uniform vec4 zone0_v0; uniform vec4 zone0_v1; uniform vec4 zone0_v2; uniform vec4 zone0_v3;
uniform vec4 zone0_v4; uniform vec4 zone0_v5; uniform vec4 zone0_v6; uniform vec4 zone0_v7;
uniform vec4 zone1_v0; uniform vec4 zone1_v1; uniform vec4 zone1_v2; uniform vec4 zone1_v3;
uniform vec4 zone1_v4; uniform vec4 zone1_v5; uniform vec4 zone1_v6; uniform vec4 zone1_v7;
uniform vec4 zone2_v0; uniform vec4 zone2_v1; uniform vec4 zone2_v2; uniform vec4 zone2_v3;
uniform vec4 zone2_v4; uniform vec4 zone2_v5; uniform vec4 zone2_v6; uniform vec4 zone2_v7;
uniform vec4 zone3_v0; uniform vec4 zone3_v1; uniform vec4 zone3_v2; uniform vec4 zone3_v3;
uniform vec4 zone3_v4; uniform vec4 zone3_v5; uniform vec4 zone3_v6; uniform vec4 zone3_v7;
uniform vec4 zone4_v0; uniform vec4 zone4_v1; uniform vec4 zone4_v2; uniform vec4 zone4_v3;
uniform vec4 zone4_v4; uniform vec4 zone4_v5; uniform vec4 zone4_v6; uniform vec4 zone4_v7;
uniform vec4 zone5_v0; uniform vec4 zone5_v1; uniform vec4 zone5_v2; uniform vec4 zone5_v3;
uniform vec4 zone5_v4; uniform vec4 zone5_v5; uniform vec4 zone5_v6; uniform vec4 zone5_v7;
uniform vec4 zone6_v0; uniform vec4 zone6_v1; uniform vec4 zone6_v2; uniform vec4 zone6_v3;
uniform vec4 zone6_v4; uniform vec4 zone6_v5; uniform vec4 zone6_v6; uniform vec4 zone6_v7;
uniform vec4 zone7_v0; uniform vec4 zone7_v1; uniform vec4 zone7_v2; uniform vec4 zone7_v3;
uniform vec4 zone7_v4; uniform vec4 zone7_v5; uniform vec4 zone7_v6; uniform vec4 zone7_v7;

out vec4 fragColor;

vec4 getZonePack(int zoneIdx, int pairIdx) {
    if (zoneIdx == 0) {
        if (pairIdx == 0) return zone0_v0;
        if (pairIdx == 1) return zone0_v1;
        if (pairIdx == 2) return zone0_v2;
        if (pairIdx == 3) return zone0_v3;
        if (pairIdx == 4) return zone0_v4;
        if (pairIdx == 5) return zone0_v5;
        if (pairIdx == 6) return zone0_v6;
        return zone0_v7;
    } else if (zoneIdx == 1) {
        if (pairIdx == 0) return zone1_v0;
        if (pairIdx == 1) return zone1_v1;
        if (pairIdx == 2) return zone1_v2;
        if (pairIdx == 3) return zone1_v3;
        if (pairIdx == 4) return zone1_v4;
        if (pairIdx == 5) return zone1_v5;
        if (pairIdx == 6) return zone1_v6;
        return zone1_v7;
    } else if (zoneIdx == 2) {
        if (pairIdx == 0) return zone2_v0;
        if (pairIdx == 1) return zone2_v1;
        if (pairIdx == 2) return zone2_v2;
        if (pairIdx == 3) return zone2_v3;
        if (pairIdx == 4) return zone2_v4;
        if (pairIdx == 5) return zone2_v5;
        if (pairIdx == 6) return zone2_v6;
        return zone2_v7;
    } else if (zoneIdx == 3) {
        if (pairIdx == 0) return zone3_v0;
        if (pairIdx == 1) return zone3_v1;
        if (pairIdx == 2) return zone3_v2;
        if (pairIdx == 3) return zone3_v3;
        if (pairIdx == 4) return zone3_v4;
        if (pairIdx == 5) return zone3_v5;
        if (pairIdx == 6) return zone3_v6;
        return zone3_v7;
    } else if (zoneIdx == 4) {
        if (pairIdx == 0) return zone4_v0;
        if (pairIdx == 1) return zone4_v1;
        if (pairIdx == 2) return zone4_v2;
        if (pairIdx == 3) return zone4_v3;
        if (pairIdx == 4) return zone4_v4;
        if (pairIdx == 5) return zone4_v5;
        if (pairIdx == 6) return zone4_v6;
        return zone4_v7;
    } else if (zoneIdx == 5) {
        if (pairIdx == 0) return zone5_v0;
        if (pairIdx == 1) return zone5_v1;
        if (pairIdx == 2) return zone5_v2;
        if (pairIdx == 3) return zone5_v3;
        if (pairIdx == 4) return zone5_v4;
        if (pairIdx == 5) return zone5_v5;
        if (pairIdx == 6) return zone5_v6;
        return zone5_v7;
    } else if (zoneIdx == 6) {
        if (pairIdx == 0) return zone6_v0;
        if (pairIdx == 1) return zone6_v1;
        if (pairIdx == 2) return zone6_v2;
        if (pairIdx == 3) return zone6_v3;
        if (pairIdx == 4) return zone6_v4;
        if (pairIdx == 5) return zone6_v5;
        if (pairIdx == 6) return zone6_v6;
        return zone6_v7;
    }
    if (pairIdx == 0) return zone7_v0;
    if (pairIdx == 1) return zone7_v1;
    if (pairIdx == 2) return zone7_v2;
    if (pairIdx == 3) return zone7_v3;
    if (pairIdx == 4) return zone7_v4;
    if (pairIdx == 5) return zone7_v5;
    if (pairIdx == 6) return zone7_v6;
    return zone7_v7;
}

vec2 getVert(int zoneIdx, int vertIdx) {
    vec4 packed = getZonePack(zoneIdx, vertIdx / 2);
    return (vertIdx % 2 == 0) ? packed.xy : packed.zw;
}

int getZoneCount(int z) {
    if (z == 0) return zone0_count;
    if (z == 1) return zone1_count;
    if (z == 2) return zone2_count;
    if (z == 3) return zone3_count;
    if (z == 4) return zone4_count;
    if (z == 5) return zone5_count;
    if (z == 6) return zone6_count;
    return zone7_count;
}

int getZoneActive(int z) {
    if (z == 0) return zone0_active;
    if (z == 1) return zone1_active;
    if (z == 2) return zone2_active;
    if (z == 3) return zone3_active;
    if (z == 4) return zone4_active;
    if (z == 5) return zone5_active;
    if (z == 6) return zone6_active;
    return zone7_active;
}

float getZoneAlpha(int z) {
    if (z == 0) return zone0_alpha;
    if (z == 1) return zone1_alpha;
    if (z == 2) return zone2_alpha;
    if (z == 3) return zone3_alpha;
    if (z == 4) return zone4_alpha;
    if (z == 5) return zone5_alpha;
    if (z == 6) return zone6_alpha;
    return zone7_alpha;
}

vec4 sampleZone(int z, vec2 uv) {
    if (z == 0) return texture(zone0_tex, uv);
    if (z == 1) return texture(zone1_tex, uv);
    if (z == 2) return texture(zone2_tex, uv);
    if (z == 3) return texture(zone3_tex, uv);
    if (z == 4) return texture(zone4_tex, uv);
    if (z == 5) return texture(zone5_tex, uv);
    if (z == 6) return texture(zone6_tex, uv);
    return texture(zone7_tex, uv);
}

bool pointInZone(vec2 p, int zoneIdx) {
    int n = getZoneCount(zoneIdx);
    if (n < 3) return false;
    bool inside = false;
    vec2 prev = getVert(zoneIdx, n - 1);
    for (int i = 0; i < MAX_VERTS_PER_ZONE; i++) {
        if (i >= n) break;
        vec2 cur = getVert(zoneIdx, i);
        bool crosses = (cur.y > p.y) != (prev.y > p.y);
        if (crosses) {
            float xCross = (prev.x - cur.x) * (p.y - cur.y) / (prev.y - cur.y + 1e-9) + cur.x;
            if (p.x < xCross) inside = !inside;
        }
        prev = cur;
    }
    return inside;
}

float distToZoneEdge(vec2 p, int zoneIdx) {
    int n = getZoneCount(zoneIdx);
    if (n < 3) return 1e9;
    float d = 1e9;
    vec2 prev = getVert(zoneIdx, n - 1);
    for (int i = 0; i < MAX_VERTS_PER_ZONE; i++) {
        if (i >= n) break;
        vec2 cur = getVert(zoneIdx, i);
        vec2 ab = cur - prev;
        float len2 = max(dot(ab, ab), 1e-9);
        float t = clamp(dot(p - prev, ab) / len2, 0.0, 1.0);
        vec2 closest = prev + t * ab;
        d = min(d, length(p - closest));
        prev = cur;
    }
    return d;
}

// =====================================================================
// Coons-patch warp
//
// The Remap app's eight handles (4 corners + 4 mid-edge) define a
// tensor-product Bézier-like surface that maps the unit source square
// onto the projected destination quad:
//
//     P(u, v) = lerp(L(v), R(v), u)
//             + lerp(T(u), B(u), v)
//             - bilerp(corners, u, v)
//
// where L/R/T/B are quadratic Béziers through (corner, midpoint, corner).
// We need the inverse: given a destination position p, find the source
// (u, v) that the Coons patch maps to p. There's no closed form, so we
// run a few Newton iterations with a numerical Jacobian. Convergence is
// reliable for typical projection-mapping warps.
// =====================================================================

vec2 quadBezier(vec2 a, vec2 b, vec2 c, float t) {
    float inv = 1.0 - t;
    return inv * inv * a + 2.0 * inv * t * b + t * t * c;
}

vec2 sampleCoonsPatch(vec2 uv) {
    vec2 top    = quadBezier(warpCorner0, warpMid0, warpCorner1, uv.x);
    vec2 bottom = quadBezier(warpCorner3, warpMid2, warpCorner2, uv.x);
    vec2 left   = quadBezier(warpCorner0, warpMid3, warpCorner3, uv.y);
    vec2 right  = quadBezier(warpCorner1, warpMid1, warpCorner2, uv.y);

    vec2 lr = mix(left, right, uv.x);
    vec2 tb = mix(top, bottom, uv.y);
    vec2 corner = mix(
        mix(warpCorner0, warpCorner1, uv.x),
        mix(warpCorner3, warpCorner2, uv.x),
        uv.y
    );
    return lr + tb - corner;
}

// Inverse warp via Newton iteration. Start at the identity guess (uv = p)
// and refine. 8 iterations is plenty for projection-mapping warps; we
// bail early once the residual is sub-pixel.
vec2 inverseWarp(vec2 target) {
    vec2 uv = target;
    for (int i = 0; i < 8; i++) {
        vec2 p = sampleCoonsPatch(uv);
        vec2 err = p - target;
        if (dot(err, err) < 1e-10) break;

        // Numerical Jacobian (central differences). h is in source-UV space;
        // 5e-3 is comfortably small relative to the 0..1 range while staying
        // far enough from the boundary that probes near a corner don't bias
        // the gradient with extrapolated samples.
        const float H = 5e-3;
        vec2 dpdu = (sampleCoonsPatch(uv + vec2(H, 0.0)) - sampleCoonsPatch(uv - vec2(H, 0.0))) / (2.0 * H);
        vec2 dpdv = (sampleCoonsPatch(uv + vec2(0.0, H)) - sampleCoonsPatch(uv - vec2(0.0, H))) / (2.0 * H);

        // Solve J * delta = err for delta, then uv -= delta.
        float det = dpdu.x * dpdv.y - dpdu.y * dpdv.x;
        if (abs(det) < 1e-10) break;
        float invDet = 1.0 / det;
        vec2 delta = vec2(
            invDet * ( dpdv.y * err.x - dpdv.x * err.y),
            invDet * (-dpdu.y * err.x + dpdu.x * err.y)
        );
        uv -= delta;
    }
    return uv;
}

void main() {
    vec2 screen = gl_FragCoord.xy / resolution;
    // gl_FragCoord is bottom-left origin (Y-up); remap JSON is top-left
    // (Y-down). Flip y so polygon tests match the JSON. The WGSL path
    // does NOT apply this flip because @builtin(position) is already
    // top-left in WebGPU.
    vec2 screenJson = vec2(screen.x, 1.0 - screen.y);

    // p is the source-space UV (top-left origin) used for both zone
    // testing and surface sampling. With warp enabled, run the screen
    // position through the inverse Coons patch; pixels that fall outside
    // the unit square land on the background.
    vec2 p;
    if (warpEnabled) {
        p = inverseWarp(screenJson);
        if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
            fragColor = vec4(bgColor, bgAlpha);
            return;
        }
    } else {
        p = screenJson;
    }
    // Texture sampling expects bottom-left origin in this codebase.
    vec2 sampleUv = vec2(p.x, 1.0 - p.y);

    vec4 result = vec4(bgColor, bgAlpha);
    int activeCount = min(zoneCount, MAX_ZONES);
    for (int z = 0; z < MAX_ZONES; z++) {
        if (z >= activeCount) break;
        if (getZoneActive(z) == 0) continue;  // source surface not wired
        if (!pointInZone(p, z)) continue;
        vec4 src = sampleZone(z, sampleUv);
        float zAlpha = getZoneAlpha(z);
        // smoothEdge is user-facing 0..1; scale to the actual source-UV
        // distance (0..0.05), beyond which the fade looks like washout.
        float edgeWidth = smoothEdge * 0.05;
        float edge = edgeWidth > 0.0
            ? smoothstep(0.0, edgeWidth, distToZoneEdge(p, z))
            : 1.0;
        float a = zAlpha * edge;
        result = vec4(mix(result.rgb, src.rgb, a), max(result.a, src.a * a));
    }

    fragColor = result;
}
