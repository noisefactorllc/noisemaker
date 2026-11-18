/*
 * Stipple - discrete random marks reproducing image tone. See
 * stipple.glsl for the full algorithm derivation and mode
 * mapping; this is a 1:1 port.
 *
 * tileOffset converts tile-local positions into global procedural
 * coordinates and converts each global pointillize seed back into the local
 * input texture. It is zero for ordinary full-frame renders.
 *
 * Every hash, noise, distance and blend runs in unsigned integer fixed
 * point from the integer pixel coordinate, with the same PCG3D hash and
 * texel reads as stipple.glsl, so both backends produce the same bytes.
 * mezzoStrokes's 45-degree rotation is the integer form of GLSL's
 * column-major mat2(c,-s,s,c) multiplication, so the marks keep the same
 * presented slope on both backends.
 *
 * MODE is a compile-time const injected by the runtime via injectDefines
 * (see definition.js `globals.mode.define`). Same fix as the GLSL
 * backend - collapses the 5-way mode dispatch so it constant-folds
 * instead of branching on a runtime uniform. The old `mode` field is
 * removed from Uniforms; the packer maps the remaining fields by name to
 * recomputed byte offsets, so removal is safe.
 */

struct Uniforms {
    cellSize: f32,
    grainSize: f32,
    density: f32,
    paperColor: vec3<f32>,
    seed: i32,
    tileOffset: vec2<f32>,
}

// binding(0) is unused: every read is a textureLoad.
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// hash - PCG3D integer hash (Jarzynski & Olano 2020).
fn pcg3d(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

// 16-bit hash of a lattice cell and seed.
fn hash16(cell: vec2<u32>, s: u32) -> u32 {
    return pcg3d(vec3<u32>(cell, s)).x >> 16u;
}

// Channel value as 16-bit unorm. Scaling by 65536 is exact, so the floor is too.
fn unorm16(x: f32) -> u32 {
    return min(u32(clamp(x, 0.0, 1.0) * 65536.0), 65535u);
}

// luminance - Rec. 709 luminance, 16-bit, weights summing to 65536.
fn lum16(c: vec3<f32>) -> u32 {
    return (unorm16(c.r) * 13933u + unorm16(c.g) * 46872u + unorm16(c.b) * 4731u) >> 16u;
}

// Smoothstep weight t * t * (3 - 2t) of a 12-bit fraction.
fn smooth12(t: u32) -> u32 {
    return (((t * t) >> 12u) * (12288u - 2u * t)) >> 12u;
}

// value noise - value noise at position n / d in lattice cells, 16-bit.
fn vnoise(n: vec2<u32>, d: vec2<u32>, s: u32) -> u32 {
    let i = n / d;
    let f = ((n - i * d) << vec2<u32>(12u)) / d;
    let ux = smooth12(f.x);
    let uy = smooth12(f.y);
    let ab = (hash16(i, s) * (4096u - ux) + hash16(i + vec2<u32>(1u, 0u), s) * ux) >> 12u;
    let cd = (hash16(i + vec2<u32>(0u, 1u), s) * (4096u - ux) + hash16(i + vec2<u32>(1u, 1u), s) * ux) >> 12u;
    return (ab * (4096u - uy) + cd * uy) >> 12u;
}

// fBm - 5 octaves of value noise on a lattice of 4 * grain, each at 2.03x
// the frequency and half the amplitude: octave k's lattice is
// 4 * grain * M[k] / 65536, with M[k] = 65536 / 2.03^k.
fn fbm(n: vec2<u32>, grain: u32, s: u32) -> u32 {
    var M = array<u32, 5>(65536u, 32284u, 15903u, 7834u, 3859u);
    var v = 0u;
    for (var k = 0u; k < 5u; k++) {
        let dk = max((grain * M[k] + 8192u) >> 14u, 1u);
        v += vnoise(n, vec2<u32>(dk), s) >> (k + 1u);
    }
    return v;
}

// Floor of the integer square root: a float estimate, corrected in integers.
fn isqrt(x: u32) -> u32 {
    var r = u32(sqrt(f32(x)));
    if (r * r > x) { r--; }
    if (r * r > x) { r--; }
    if ((r + 1u) * (r + 1u) <= x) { r++; }
    if ((r + 1u) * (r + 1u) <= x) { r++; }
    return r;
}

// Mezzo and reticulation threshold step(edge + (density - 50) / 100, value)
// on 16-bit values, density in 1/256 units, multiplied through by 25.
fn inkStep(edge: u32, value: u32, d256: i32) -> f32 {
    return select(0.0, 1.0, 25 * i32(value) + 819200 >= 25 * i32(edge) + 64 * d256);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texel = vec2<i32>(pos.xy);
    let texSize = vec2<i32>(textureDimensions(inputTex));
    // Global (tile-aware) pixel. Positions are pixel centers in 1/256 px,
    // (2 * px + 1) * 128, over sizes in 1/256 px.
    let px = vec2<u32>(texel + vec2<i32>(uniforms.tileOffset));
    let center = (2u * px + 1u) * 128u;
    let src = textureLoad(inputTex, texel, 0);
    let s = u32(uniforms.seed);
    let d256 = i32(floor(uniforms.density * 256.0));
    let g256 = clamp(u32(max(uniforms.grainSize, 0.0) * 256.0), 1u, 32768u);
    var result: vec3<f32>;

    if (MODE == 0) {
        // Pointillize. The dot edge blends over 2 px on each side.
        let c256 = clamp(u32(max(uniforms.cellSize, 0.0) * 256.0), 1u, 65535u);
        let g = center / c256;
        let f = vec2<i32>(((center - g * c256) << vec2<u32>(12u)) / c256);
        // Jittered-grid Voronoi in 12-bit cell units: seed point = cell +
        // 0.5 + (hash - 0.5) * 0.9.
        var best = 2147483647;
        var bestPt = vec2<i32>(0);
        for (var y = -1; y <= 1; y++) {
            for (var x = -1; x <= 1; x++) {
                let cell = vec2<i32>(x, y);
                let h = pcg3d(vec3<u32>(vec2<u32>(vec2<i32>(g) + cell), s)).xy >> vec2<u32>(16u);
                let pt = cell * 4096 + 205 + vec2<i32>(((h * 9u) / 10u) >> vec2<u32>(4u));
                let dv = pt - f;
                let dd = dv.x * dv.x + dv.y * dv.y;
                if (dd < best) {
                    best = dd;
                    bestPt = pt;
                }
            }
        }
        // Seed point in 1/256 px, measured from the cell to the lower left
        // so the offset stays positive; the dot's color is the texel under it.
        let seed256 = (vec2<i32>(g) - 1) * i32(c256) + vec2<i32>((vec2<u32>(bestPt + 4096) * c256) >> vec2<u32>(12u));
        let seedTexel = clamp((max(seed256, vec2<i32>(0)) >> vec2<u32>(8u)) - vec2<i32>(uniforms.tileOffset), vec2<i32>(0), texSize - 1);
        let seedColor = textureLoad(inputTex, seedTexel, 0).rgb;
        let radius = 1434 + i32((1638u * (65535u - lum16(seedColor))) >> 16u);
        let d = i32(isqrt(u32(best)));
        let aa = i32(2097152u / c256);
        var t = 0u;
        if (d >= radius + aa) {
            t = 4096u;
        } else if (d > radius - aa) {
            t = (u32(d - radius + aa) << 12u) / u32(2 * aa);
        }
        let inside = 4096u - smooth12(t);
        let paper = vec3<u32>(unorm16(uniforms.paperColor.r), unorm16(uniforms.paperColor.g), unorm16(uniforms.paperColor.b));
        let ink = vec3<u32>(unorm16(seedColor.r), unorm16(seedColor.g), unorm16(seedColor.b));
        result = vec3<f32>((paper * (4096u - inside) + ink * inside) >> vec3<u32>(12u)) / 65536.0;
    } else if (MODE == 1 || MODE == 2 || MODE == 3) {
        // Mezzotint dots/lines/strokes.
        var p = center;
        var grain = g256;
        if (MODE == 3) {
            // Rotate 45 degrees: x' = (x + y) / sqrt2, y' = (y - x) / sqrt2,
            // with the 1 / sqrt2 in the grain size; see stipple.glsl.
            p = vec2<u32>((px.x + px.y + 1u) * 256u, (px.y + 1048576u - px.x) * 256u);
            grain = (g256 * 92682u + 32768u) >> 16u;
        }
        var lattice = vec2<u32>(grain);
        if (MODE != 1) {
            // See stipple.glsl: Y keeps the coarse scale, X the fine
            // scale, so streaks run vertically.
            lattice = vec2<u32>(grain, grain * 8u);
        }
        let n = vnoise(p, lattice, s);
        result = vec3<f32>(inkStep(n, unorm16(src.r), d256), inkStep(n, unorm16(src.g), d256), inkStep(n, unorm16(src.b), d256));
    } else {
        // Reticulation, with amplitude mix(1.2, 0.6, l) in 1/65536 units.
        let l = lum16(src.rgb);
        let amp = 78643u - ((39322u * l) >> 16u);
        let clumpNoise = (fbm(center, g256, s) * (amp >> 2u)) >> 14u;
        result = select(vec3<f32>(0.05), vec3<f32>(0.97), inkStep(clumpNoise, l, d256) > 0.5);
    }

    return vec4<f32>(result, src.a);
}
