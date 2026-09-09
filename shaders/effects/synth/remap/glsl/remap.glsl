/**
 * Remap - GLSL fragment shader
 *
 * Polygon-zone router. Zones are composited TOP-DOWN: the last active zone
 * (highest index) that contains a pixel is on top. A zone's coverage is 1
 * everywhere inside its polygon and feathers OUTWARD over
 * `smoothEdge * 0.05 * min(fullResolution)` pixels, so the interior is
 * never eroded: adjacent zones meet without a seam and canvas borders
 * stay clean. Sources are premultiplied and stacked with the premultiplied
 * "under" operator, so a transparent source shows the zone below it, or
 * the background.
 *
 * Per zone, ONE pass over the packed vertex pairs (one uniform fetch per
 * two vertices) evaluates the even-odd inside test and the squared pixel
 * distance to the boundary together. With smoothEdge 0 the walk carries no
 * distance math at all, a host-supplied bounding box (zoneN_bounds) skips
 * zones the pixel cannot touch, and the zone loop stops as soon as the
 * pixel is opaque.
 */

#ifdef GL_ES
precision highp float;
#endif

#define MAX_ZONES 8
#define MAX_PAIRS 32  // MAX_VERTS_PER_ZONE / 2
#define HEADER_SLOT 0
#define CONTROLS_SLOT 1
#define ZONE_META_SLOT 2
#define ZONE_VERTS_SLOT 10
#define RESOLUTION_SLOT 266
#define ZONE_BOUNDS_SLOT 267

layout(std140) uniform RemapUniforms {
    vec4 data[275];
};

// Auto-filled when noisedeck is doing a tiled large-resolution export.
// When not tiling: tileOffset = (0, 0), fullResolution = resolution.
uniform vec2 tileOffset;
uniform vec2 fullResolution;

// Per-zone source surfaces. Wired in DSL via `zoneN_tex: read(oN)`.
uniform sampler2D zone0_tex;
uniform sampler2D zone1_tex;
uniform sampler2D zone2_tex;
uniform sampler2D zone3_tex;
uniform sampler2D zone4_tex;
uniform sampler2D zone5_tex;
uniform sampler2D zone6_tex;
uniform sampler2D zone7_tex;

out vec4 fragColor;

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

// Polygon state accumulated over one zone's edges for the current pixel.
struct ZoneTest {
    bool inside;   // even-odd crossing parity
    float d2;      // squared pixel distance to the nearest boundary point
};

// Folds the edge between vertex `a` and its predecessor `b` into `t`.
// All positions are global pixel coordinates (top-left origin).
ZoneTest testEdge(ZoneTest t, vec2 a, vec2 b, vec2 q, bool needDist) {
    vec2 e = b - a;
    vec2 w = q - a;
    // Even-odd crossing count along the +x ray from q, branch-free. The
    // half-open scanline rule keeps an edge shared by two zones unambiguous.
    bvec3 c = bvec3((q.y >= a.y), (q.y < b.y), (e.x * w.y > e.y * w.x));
    if (all(c) || !any(c)) t.inside = !t.inside;
    if (needDist) {
        float s = clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
        vec2 r = w - e * s;
        t.d2 = min(t.d2, dot(r, r));
    }
    return t;
}

// Walks one zone's packed vertex pairs (one uniform fetch per two vertices)
// and returns the inside parity plus the squared pixel distance to the
// boundary. `needDist` is a constant at each call site in main(), so the
// smoothEdge-0 walk is compiled without any distance math.
ZoneTest walkZone(int base, int n, vec2 q, bool needDist) {
    ZoneTest t = ZoneTest(false, 1e30);
    int last = n - 1;
    vec4 lastPack = data[base + last / 2];
    vec2 prev = (last % 2 == 0 ? lastPack.xy : lastPack.zw) * fullResolution;
    int pairs = (n + 1) / 2;
    for (int pair = 0; pair < MAX_PAIRS; pair++) {
        if (pair >= pairs) break;
        vec4 pack = data[base + pair];
        vec2 v0 = pack.xy * fullResolution;
        t = testEdge(t, v0, prev, q, needDist);
        prev = v0;
        if (pair * 2 + 1 < n) {
            vec2 v1 = pack.zw * fullResolution;
            t = testEdge(t, v1, prev, q, needDist);
            prev = v1;
        }
    }
    return t;
}

void main() {
    // Polygon tests use the GLOBAL pixel position so zones land in the same
    // image position regardless of which tile is rendering. gl_FragCoord is
    // bottom-left origin (Y-up); remap JSON is top-left (Y-down), so flip y
    // after the global-coord conversion to match the JSON convention.
    vec2 globalPx = gl_FragCoord.xy + tileOffset;
    vec2 q = vec2(globalPx.x, fullResolution.y - globalPx.y);
    vec2 p = q / fullResolution;   // normalized, for the zone bounds test
    // Texture sampling stays TILE-LOCAL: each zoneN_tex is the current
    // tile's slice of its source surface, so we sample at the tile-local
    // pixel position, not the global one. Bottom-left origin to match
    // the codebase texture convention.
    vec2 sampleUv = gl_FragCoord.xy / data[RESOLUTION_SLOT].xy;

    vec4 header = data[HEADER_SLOT];
    vec4 controls = data[CONTROLS_SLOT];
    int activeCount = min(int(controls.x), MAX_ZONES);
    // Feather width in pixels, proportional to the shorter canvas side, so
    // it is the same width on both axes whatever the aspect ratio. smoothEdge
    // is clamped at 0: an automated negative value would otherwise make the
    // bounds dilation negative and SHRINK every zone's reject box.
    float featherPx = max(controls.y, 0.0) * 0.05 * min(fullResolution.x, fullResolution.y);
    bool needDist = featherPx > 0.0;
    vec2 dilate = vec2(featherPx) / fullResolution;   // feather in normalized units per axis

    vec4 result = vec4(0.0);
    for (int k = 0; k < MAX_ZONES; k++) {
        int z = activeCount - 1 - k;   // top-down: highest index first
        if (z < 0) break;
        vec4 zoneMeta = data[ZONE_META_SLOT + z];
        // Clamped: a host-supplied count above the per-zone capacity would
        // otherwise walk past this zone's slots into the next zone's.
        int n = min(int(zoneMeta.x), MAX_PAIRS * 2);
        if (n < 3 || zoneMeta.y < 0.5) continue;   // degenerate, or source not wired
        // Host-supplied bounding box [minX, minY, maxX, maxY], dilated by the
        // feather. The default [0, 0, 1, 1] never rejects a canvas pixel.
        vec4 bounds = data[ZONE_BOUNDS_SLOT + z];
        if (any(lessThan(p, bounds.xy - dilate)) || any(greaterThan(p, bounds.zw + dilate))) continue;
        int base = ZONE_VERTS_SLOT + z * MAX_PAIRS;

        ZoneTest t;
        if (needDist) {
            t = walkZone(base, n, q, true);
        } else {
            t = walkZone(base, n, q, false);
        }

        float coverage = 1.0;
        if (!t.inside) {
            if (!needDist) continue;
            coverage = 1.0 - smoothstep(0.0, featherPx, sqrt(t.d2));
            if (coverage <= 0.0) continue;
        }
        // Premultiplied "under": this zone is above everything still to come.
        vec4 src = sampleZone(z, sampleUv) * (coverage * zoneMeta.w);
        result += src * (1.0 - result.a);
        if (result.a >= 0.999) break;
    }
    // Background goes under whatever the zones left uncovered.
    result += vec4(header.xyz * header.w, header.w) * (1.0 - result.a);

    fragColor = result;
}
