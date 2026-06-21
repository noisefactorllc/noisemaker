/**
 * Remap - GLSL fragment shader
 *
 * For each pixel, walks active zones (vertexCount >= 3 and source wired)
 * and tests whether the UV is inside the polygon. The first matching
 * zone wins; the pixel samples from that zone's wired source surface.
 * Pixels outside every active zone show the background color.
 *
 * Edge smoothing is applied as a soft alpha falloff at polygon boundaries
 * so adjacent zones blend instead of producing aliased edges.
 */

#ifdef GL_ES
precision highp float;
#endif

#define MAX_ZONES 8
#define MAX_VERTS_PER_ZONE 64
#define MAX_PAIRS 32  // MAX_VERTS_PER_ZONE / 2
#define HEADER_SLOT 0
#define CONTROLS_SLOT 1
#define ZONE_META_SLOT 2
#define ZONE_VERTS_SLOT 10

layout(std140) uniform RemapUniforms {
    vec4 data[267];
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

vec4 getZoneMeta(int z) {
    return data[ZONE_META_SLOT + z];
}

vec4 getZonePack(int zoneIdx, int pairIdx) {
    return data[ZONE_VERTS_SLOT + zoneIdx * MAX_PAIRS + pairIdx];
}

vec2 getVert(int zoneIdx, int vertIdx) {
    vec4 packed = getZonePack(zoneIdx, vertIdx / 2);
    return (vertIdx % 2 == 0) ? packed.xy : packed.zw;
}

int getZoneCount(int z) {
    return int(getZoneMeta(z).x);
}

int getZoneActive(int z) {
    return int(getZoneMeta(z).y + 0.5);
}

float getZoneAlpha(int z) {
    return getZoneMeta(z).w;
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

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    // Polygon tests use GLOBAL UV so zones land in the same image position
    // regardless of which tile is rendering. gl_FragCoord is bottom-left
    // origin (Y-up); remap JSON is top-left (Y-down) - flip y after the
    // global-coord conversion to match the JSON convention.
    vec2 globalScreen = (gl_FragCoord.xy + tileOffset) / fullResolution;
    vec2 p = vec2(globalScreen.x, 1.0 - globalScreen.y);
    // Texture sampling stays TILE-LOCAL: each zoneN_tex is the current
    // tile's slice of its source surface, so we sample at the tile-local
    // pixel position, not the global one. Bottom-left origin to match
    // the codebase texture convention.
    vec2 sampleUv = globalCoord / fullResolution;

    vec4 header = data[HEADER_SLOT];
    vec4 controls = data[CONTROLS_SLOT];
    vec3 bgColor = header.xyz;
    float bgAlpha = header.w;
    int activeCount = min(int(controls.x), MAX_ZONES);
    float smoothEdge = controls.y;

    vec4 result = vec4(bgColor, bgAlpha);
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
