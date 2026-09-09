/**
 * Remap — WGSL fragment shader
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
 * pixel is opaque. Uniforms are packed into a single vec4 array to match
 * the JS uniformLayout.
 */

struct Uniforms {
    data: array<vec4<f32>, 275>,
    // slot 0:      bgR, bgG, bgB, bgAlpha
    // slot 1:      zoneCount, smoothEdge, _, time
    // slot 2..9:   per-zone meta (vertexCount, active, _, alpha)
    //              `active` is 1 when zoneN_tex is wired, 0 when "none".
    // slot 10..265: per-zone polygons; 32 vec4s per zone (64 verts packed two
    //              per vec4 as v_2k.xy + v_2k+1.xy)
    // slot 266.xy: resolution (auto-filled by the runtime)
    // slot 267..274: per-zone bounds [minX, minY, maxX, maxY], normalized;
    //              default [0, 0, 1, 1] never rejects a pixel
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

const MAX_ZONES: i32 = 8;
const MAX_PAIRS: i32 = 32;  // MAX_VERTS_PER_ZONE / 2
const HEADER_SLOT: i32 = 0;
const CONTROLS_SLOT: i32 = 1;
const ZONE_META_SLOT: i32 = 2;
const ZONE_VERTS_SLOT: i32 = 10;
const RESOLUTION_SLOT: i32 = 266;
const ZONE_BOUNDS_SLOT: i32 = 267;

fn sampleZone(z: i32, uv: vec2<f32>) -> vec4<f32> {
    // textureSampleLevel (explicit LOD 0) — sampleZone is called from the
    // per-pixel, data-dependent zone loop (non-uniform control flow), which
    // disqualifies plain textureSample (it needs implicit derivatives /
    // uniform control flow). Zone surfaces are non-mipmapped render targets,
    // so LOD 0 is exactly GLSL's texture() here. Mirrors the mixer/shadow port.
    if (z == 0) { return textureSampleLevel(zone0_tex, samp, uv, 0.0); }
    if (z == 1) { return textureSampleLevel(zone1_tex, samp, uv, 0.0); }
    if (z == 2) { return textureSampleLevel(zone2_tex, samp, uv, 0.0); }
    if (z == 3) { return textureSampleLevel(zone3_tex, samp, uv, 0.0); }
    if (z == 4) { return textureSampleLevel(zone4_tex, samp, uv, 0.0); }
    if (z == 5) { return textureSampleLevel(zone5_tex, samp, uv, 0.0); }
    if (z == 6) { return textureSampleLevel(zone6_tex, samp, uv, 0.0); }
    return textureSampleLevel(zone7_tex, samp, uv, 0.0);
}

// Polygon state accumulated over one zone's edges for the current pixel.
struct ZoneTest {
    inside: bool,   // even-odd crossing parity
    d2: f32,        // squared pixel distance to the nearest boundary point
}

// Folds the edge between vertex `a` and its predecessor `b` into `t0`.
// All positions are global pixel coordinates (top-left origin).
fn testEdge(t0: ZoneTest, a: vec2<f32>, b: vec2<f32>, q: vec2<f32>, needDist: bool) -> ZoneTest {
    var t = t0;
    let e = b - a;
    let w = q - a;
    // Even-odd crossing count along the +x ray from q, branch-free. The
    // half-open scanline rule keeps an edge shared by two zones unambiguous.
    let c = vec3<bool>((q.y >= a.y), (q.y < b.y), (e.x * w.y > e.y * w.x));
    if (all(c) || !any(c)) { t.inside = !t.inside; }
    if (needDist) {
        let s = clamp(dot(w, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
        let r = w - e * s;
        t.d2 = min(t.d2, dot(r, r));
    }
    return t;
}

// Walks one zone's packed vertex pairs (one uniform fetch per two vertices)
// and returns the inside parity plus the squared pixel distance to the
// boundary. `needDist` is a constant at each call site in fragmentMain(),
// so the smoothEdge-0 walk is compiled without any distance math.
fn walkZone(base: i32, n: i32, q: vec2<f32>, needDist: bool) -> ZoneTest {
    var t = ZoneTest(false, 1e30);
    let last: i32 = n - 1;
    let lastPack = uniforms.data[base + last / 2];
    var prev = select(lastPack.zw, lastPack.xy, last % 2 == 0) * fullResolution;
    let pairs: i32 = (n + 1) / 2;
    for (var pair: i32 = 0; pair < MAX_PAIRS; pair = pair + 1) {
        if (pair >= pairs) { break; }
        let pack = uniforms.data[base + pair];
        let v0 = pack.xy * fullResolution;
        t = testEdge(t, v0, prev, q, needDist);
        prev = v0;
        if (pair * 2 + 1 < n) {
            let v1 = pack.zw * fullResolution;
            t = testEdge(t, v1, prev, q, needDist);
            prev = v1;
        }
    }
    return t;
}

@fragment
fn fragmentMain(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    // Polygon tests use the GLOBAL pixel position so zones land in the same
    // image position regardless of which tile is rendering. The y flip below
    // is not a claim about the origin @builtin(position) uses — the WGSL spec
    // does not settle that here. It is the flip that makes this backend agree
    // with the GLSL one, which the orientation case in
    // shaders/tests/test_remap_render.mjs and byte parity with GLSL
    // (parity-attestation.json, maxDiff 0) both hold to.
    let globalPx = fragCoord.xy + tileOffset;
    let q = vec2<f32>(globalPx.x, fullResolution.y - globalPx.y);
    let p = q / fullResolution;   // normalized, for the zone bounds test
    // Texture sampling stays TILE-LOCAL: each zoneN_tex is the current
    // tile's slice of its source surface, so sample at the tile-local
    // pixel position, not the global one.
    let sampleUv = fragCoord.xy / uniforms.data[RESOLUTION_SLOT].xy;

    let header = uniforms.data[HEADER_SLOT];
    let controls = uniforms.data[CONTROLS_SLOT];
    let activeCount: i32 = min(i32(controls.x), MAX_ZONES);
    // Feather width in pixels, proportional to the shorter canvas side, so
    // it is the same width on both axes whatever the aspect ratio. smoothEdge
    // is clamped at 0: an automated negative value would otherwise make the
    // bounds dilation negative and SHRINK every zone's reject box.
    let featherPx: f32 = max(controls.y, 0.0) * 0.05 * min(fullResolution.x, fullResolution.y);
    let needDist: bool = featherPx > 0.0;
    let dilate = vec2<f32>(featherPx) / fullResolution;   // feather in normalized units per axis

    var result = vec4<f32>(0.0);
    for (var k: i32 = 0; k < MAX_ZONES; k = k + 1) {
        let z: i32 = activeCount - 1 - k;   // top-down: highest index first
        if (z < 0) { break; }
        let zoneMeta = uniforms.data[ZONE_META_SLOT + z];
        // Clamped: a host-supplied count above the per-zone capacity would
        // otherwise walk past this zone's slots into the next zone's.
        let n: i32 = min(i32(zoneMeta.x), MAX_PAIRS * 2);
        if (n < 3 || zoneMeta.y < 0.5) { continue; }   // degenerate, or source not wired
        // Host-supplied bounding box [minX, minY, maxX, maxY], dilated by the
        // feather. The default [0, 0, 1, 1] never rejects a canvas pixel.
        let bounds = uniforms.data[ZONE_BOUNDS_SLOT + z];
        if (any(p < bounds.xy - dilate) || any(p > bounds.zw + dilate)) { continue; }
        let base: i32 = ZONE_VERTS_SLOT + z * MAX_PAIRS;

        var t: ZoneTest;
        if (needDist) {
            t = walkZone(base, n, q, true);
        } else {
            t = walkZone(base, n, q, false);
        }

        var coverage: f32 = 1.0;
        if (!t.inside) {
            if (!needDist) { continue; }
            coverage = 1.0 - smoothstep(0.0, featherPx, sqrt(t.d2));
            if (coverage <= 0.0) { continue; }
        }
        // Premultiplied "under": this zone is above everything still to come.
        let src = sampleZone(z, sampleUv) * (coverage * zoneMeta.w);
        result = result + src * (1.0 - result.a);
        if (result.a >= 0.999) { break; }
    }
    // Background goes under whatever the zones left uncovered.
    result = result + vec4<f32>(header.xyz * header.w, header.w) * (1.0 - result.a);

    return result;
}
