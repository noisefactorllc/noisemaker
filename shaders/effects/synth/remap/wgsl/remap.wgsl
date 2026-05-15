/**
 * Remap — WGSL fragment shader
 *
 * Per-pixel: walk active zones, find the first matching polygon, sample
 * from that zone's wired source surface. Uniforms are packed into a
 * single vec4 array to match the JS uniformLayout.
 */

struct Uniforms {
    data: array<vec4<f32>, 75>,
    // slot 0:      bgR, bgG, bgB, bgAlpha
    // slot 1:      zoneCount, smoothEdge, _, time
    // slot 2..9:   per-zone meta (vertexCount, active, _, alpha)
    //              `active` is 1 when zoneN_tex is wired, 0 when "none".
    // slot 10..73: per-zone polygons; 8 vec4s per zone (16 verts packed two
    //              per vec4 as v_2k.xy + v_2k+1.xy)
    // slot 74.xy:  resolution (auto-filled by the runtime)
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var zone0_tex: texture_2d<f32>;
@group(0) @binding(3) var zone1_tex: texture_2d<f32>;
@group(0) @binding(4) var zone2_tex: texture_2d<f32>;
@group(0) @binding(5) var zone3_tex: texture_2d<f32>;
@group(0) @binding(6) var zone4_tex: texture_2d<f32>;
@group(0) @binding(7) var zone5_tex: texture_2d<f32>;
@group(0) @binding(8) var zone6_tex: texture_2d<f32>;
@group(0) @binding(9) var zone7_tex: texture_2d<f32>;
// Auto-filled when noisedeck is doing a tiled large-resolution export.
// When not tiling: tileOffset = (0, 0), fullResolution = resolution.
@group(0) @binding(10) var<uniform> tileOffset: vec2<f32>;
@group(0) @binding(11) var<uniform> fullResolution: vec2<f32>;

const MAX_ZONES: u32 = 8u;
const MAX_VERTS_PER_ZONE: u32 = 16u;
const PAIRS_PER_ZONE: u32 = 8u;  // MAX_VERTS_PER_ZONE / 2

fn getZoneMeta(z: u32) -> vec4<f32> {
    return uniforms.data[2u + z];
}

fn getVert(zoneIdx: u32, vertIdx: u32) -> vec2<f32> {
    let pairIdx: u32 = vertIdx >> 1u;
    let slot: u32 = 10u + zoneIdx * PAIRS_PER_ZONE + pairIdx;
    let packed: vec4<f32> = uniforms.data[slot];
    if ((vertIdx & 1u) == 0u) {
        return packed.xy;
    }
    return packed.zw;
}

fn sampleZone(z: u32, uv: vec2<f32>) -> vec4<f32> {
    // textureSampleLevel (explicit LOD 0) — sampleZone is called from the
    // per-pixel, data-dependent zone loop (non-uniform control flow), which
    // disqualifies plain textureSample (it needs implicit derivatives /
    // uniform control flow). Zone surfaces are non-mipmapped render targets,
    // so LOD 0 is exactly GLSL's texture() here. Mirrors the mixer/shadow port.
    if (z == 0u) { return textureSampleLevel(zone0_tex, samp, uv, 0.0); }
    if (z == 1u) { return textureSampleLevel(zone1_tex, samp, uv, 0.0); }
    if (z == 2u) { return textureSampleLevel(zone2_tex, samp, uv, 0.0); }
    if (z == 3u) { return textureSampleLevel(zone3_tex, samp, uv, 0.0); }
    if (z == 4u) { return textureSampleLevel(zone4_tex, samp, uv, 0.0); }
    if (z == 5u) { return textureSampleLevel(zone5_tex, samp, uv, 0.0); }
    if (z == 6u) { return textureSampleLevel(zone6_tex, samp, uv, 0.0); }
    return textureSampleLevel(zone7_tex, samp, uv, 0.0);
}

fn pointInZone(p: vec2<f32>, zoneIdx: u32) -> bool {
    let zoneMeta = getZoneMeta(zoneIdx);
    let n = i32(zoneMeta.x);
    if (n < 3) { return false; }
    var inside: bool = false;
    var prev = getVert(zoneIdx, u32(n) - 1u);
    for (var i: u32 = 0u; i < MAX_VERTS_PER_ZONE; i = i + 1u) {
        if (i32(i) >= n) { break; }
        let cur = getVert(zoneIdx, i);
        let crosses: bool = (cur.y > p.y) != (prev.y > p.y);
        if (crosses) {
            let dy = prev.y - cur.y;
            let denom = select(dy, 1e-9, abs(dy) < 1e-9);
            let xCross = (prev.x - cur.x) * (p.y - cur.y) / denom + cur.x;
            if (p.x < xCross) { inside = !inside; }
        }
        prev = cur;
    }
    return inside;
}

fn distToZoneEdge(p: vec2<f32>, zoneIdx: u32) -> f32 {
    let zoneMeta = getZoneMeta(zoneIdx);
    let n = i32(zoneMeta.x);
    if (n < 3) { return 1e9; }
    var d: f32 = 1e9;
    var prev = getVert(zoneIdx, u32(n) - 1u);
    for (var i: u32 = 0u; i < MAX_VERTS_PER_ZONE; i = i + 1u) {
        if (i32(i) >= n) { break; }
        let cur = getVert(zoneIdx, i);
        let ab = cur - prev;
        let len2 = max(dot(ab, ab), 1e-9);
        let t = clamp(dot(p - prev, ab) / len2, 0.0, 1.0);
        let closest = prev + t * ab;
        d = min(d, length(p - closest));
        prev = cur;
    }
    return d;
}

@fragment
fn fragmentMain(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[74].xy;
    // Polygon tests use GLOBAL UV so zones land in the same image position
    // regardless of which tile is rendering. WGSL @builtin(position) is
    // top-left (Y-down); tileOffset is sent in GLSL (Y-from-bottom)
    // convention, so convert: posFromBottom.y = resolution.y - pos.y,
    // global = posFromBottom + tileOffset, then flip Y-down for the JSON.
    let posFromBottom = vec2<f32>(fragCoord.x, fragCoord.y);
    let globalYup = (posFromBottom + tileOffset) / fullResolution;
    let p = vec2<f32>(globalYup.x, 1.0 - globalYup.y);
    // Texture sampling stays TILE-LOCAL: each zoneN_tex is the current
    // tile's slice of its source surface, so sample at the tile-local
    // pixel position (Y-down to match WGSL textureSampleLevel convention).
    let sampleUv = fragCoord.xy / resolution;

    let header = uniforms.data[0];
    let header2 = uniforms.data[1];
    let bgColor = vec3<f32>(header.x, header.y, header.z);
    let bgAlpha = header.w;
    let zoneCount: i32 = i32(header2.x);
    let smoothEdge: f32 = header2.y;

    var result = vec4<f32>(bgColor, bgAlpha);
    let activeCount: i32 = min(zoneCount, i32(MAX_ZONES));
    for (var z: u32 = 0u; z < MAX_ZONES; z = z + 1u) {
        if (i32(z) >= activeCount) { break; }
        let zoneMeta = getZoneMeta(z);
        if (zoneMeta.y < 0.5) { continue; }  // zoneN_tex not wired
        if (!pointInZone(p, z)) { continue; }
        let src = sampleZone(z, sampleUv);
        let zAlpha = zoneMeta.w;
        // smoothEdge is user-facing 0..1; scale to the actual source-UV
        // distance (0..0.05), beyond which the fade looks like washout.
        let edgeWidth = smoothEdge * 0.05;
        var edge: f32 = 1.0;
        if (edgeWidth > 0.0) {
            edge = smoothstep(0.0, edgeWidth, distToZoneEdge(p, z));
        }
        let a = zAlpha * edge;
        result = vec4<f32>(mix(result.rgb, src.rgb, a), max(result.a, src.a * a));
    }

    return result;
}
