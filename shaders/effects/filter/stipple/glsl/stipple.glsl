/*
 * Stipple - discrete random marks reproducing image tone. Covers three
 * filters via `mode`:
 *
 *   pointillize (0)  - Colored dots on a paper
 *                       background, one dot per jittered-grid Voronoi
 *                       cell (Voronoi), sized by that cell's own darkness.
 *                       Inside the dot the color is the image sampled at
 *                       the cell's seed point (flat per dot, like real
 *                       pointillism); outside is paperColor.
 *   mezzoDots/Lines/Strokes (1/2/3) - Mezzotint dots/lines/
 *                       strokes conversion types: each RGB channel is
 *                       independently hard-thresholded against a shaped
 *                       value-noise field, producing the harsh per-
 *                       channel black/white/primary speckle real
 *                       mezzotint conversion has. No AA is applied to the
 *                       threshold; mezzotint is a hard binary process, and
 *                       softening it would blur the per-
 *                       channel color separation that makes the effect
 *                       read as mezzotint rather than an ordered dither.
 *   reticulation (4) - A two-tone ink/paper tonemap driven by fBm "clump" noise
 *                       whose amplitude is modulated by local luminance,
 *                       so shadows fill in with dense broad clumps and
 *                       highlights break up into fine grain.
 *
 * Single pass on global (tile-aware) pixel coordinates so every pattern
 * (Voronoi grid, noise field) is continuous across CLI render tiles.
 *
 * `density` biases the ink/paper balance in BOTH the mezzo branch (its
 * threshold n) and the reticulation branch (its threshold clumpNoise)
 * with the identical (density-50)/100 term. Density acts as reticulation
 * balance / mezzo bias, and clumpNoise-vs-lum is
 * structurally the same threshold-vs-value pairing as mezzo's n-vs-
 * channel, so the same bias mechanism was extended there for a
 * consistent, non-dead control across every mode that enables it.
 *
 * Every hash, noise, distance and blend runs in unsigned integer fixed
 * point (12-bit fractions, 16-bit values) from the integer pixel
 * coordinate, with a PCG3D hash of the lattice cell and seed, and reads
 * texels with texelFetch. Float hashes and thresholds round and fuse
 * differently in the WebGL2 and WebGPU compilers; integers give both
 * backends the same bytes.
 *
 * mezzoStrokes rotates the sampling position 45 degrees before shaping
 * the anisotropic (line) noise, in the mat2(c,-s,s,c) rotation form
 * shared with filter/halftone. The rotated y is offset by 2^20 px so the
 * unsigned position stays positive.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

// MODE is a compile-time define injected by the runtime (see definition.js
// `globals.mode.define`). Wrapping the 5-way variant dispatch in #if blocks
// instead of a runtime int dispatch lets the compiler drop the unreachable
// mode arms instead of inlining all 5 at the single call site.
#ifndef MODE
#define MODE 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float cellSize;
uniform float grainSize;
uniform float density;
uniform vec3 paperColor;
uniform int seed;

out vec4 fragColor;

// hash - PCG3D integer hash (Jarzynski & Olano 2020).
uvec3 pcg3d(uvec3 v_in) {
    uvec3 v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> uvec3(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

// 16-bit hash of a lattice cell and seed.
uint hash16(uvec2 cell, uint s) {
    return pcg3d(uvec3(cell, s)).x >> 16u;
}

// Channel value as 16-bit unorm. Scaling by 65536 is exact, so the floor is too.
uint unorm16(float x) {
    return min(uint(clamp(x, 0.0, 1.0) * 65536.0), 65535u);
}

// luminance - Rec. 709 luminance, 16-bit, weights summing to 65536.
uint lum16(vec3 c) {
    return (unorm16(c.r) * 13933u + unorm16(c.g) * 46872u + unorm16(c.b) * 4731u) >> 16u;
}

// Smoothstep weight t * t * (3 - 2t) of a 12-bit fraction.
uint smooth12(uint t) {
    return (((t * t) >> 12u) * (12288u - 2u * t)) >> 12u;
}

// value noise - value noise at position n / d in lattice cells, 16-bit.
uint vnoise(uvec2 n, uvec2 d, uint s) {
    uvec2 i = n / d;
    uvec2 f = ((n - i * d) << uvec2(12u)) / d;
    uint ux = smooth12(f.x);
    uint uy = smooth12(f.y);
    uint ab = (hash16(i, s) * (4096u - ux) + hash16(i + uvec2(1u, 0u), s) * ux) >> 12u;
    uint cd = (hash16(i + uvec2(0u, 1u), s) * (4096u - ux) + hash16(i + uvec2(1u, 1u), s) * ux) >> 12u;
    return (ab * (4096u - uy) + cd * uy) >> 12u;
}

// fBm - 5 octaves of value noise on a lattice of 4 * grain, each at 2.03x
// the frequency and half the amplitude: octave k's lattice is
// 4 * grain * M[k] / 65536, with M[k] = 65536 / 2.03^k.
uint fbm(uvec2 n, uint grain, uint s) {
    const uint M[5] = uint[5](65536u, 32284u, 15903u, 7834u, 3859u);
    uint v = 0u;
    for (int k = 0; k < 5; k++) {
        uint dk = max((grain * M[k] + 8192u) >> 14u, 1u);
        v += vnoise(n, uvec2(dk), s) >> uint(k + 1);
    }
    return v;
}

// Floor of the integer square root: a float estimate, corrected in integers.
uint isqrt(uint x) {
    uint r = uint(sqrt(float(x)));
    if (r * r > x) r--;
    if (r * r > x) r--;
    if ((r + 1u) * (r + 1u) <= x) r++;
    if ((r + 1u) * (r + 1u) <= x) r++;
    return r;
}

// Mezzo and reticulation threshold step(edge + (density - 50) / 100, value)
// on 16-bit values, density in 1/256 units, multiplied through by 25.
float inkStep(uint edge, uint value, int d256) {
    return 25 * int(value) + 819200 >= 25 * int(edge) + 64 * d256 ? 1.0 : 0.0;
}

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    ivec2 texSize = textureSize(inputTex, 0);
    // Global (tile-aware) pixel. Positions are pixel centers in 1/256 px,
    // (2 * px + 1) * 128, over sizes in 1/256 px.
    uvec2 px = uvec2(texel + ivec2(tileOffset));
    uvec2 center = (2u * px + 1u) * 128u;
    vec4 src = texelFetch(inputTex, texel, 0);
    uint s = uint(seed);
    int d256 = int(floor(density * 256.0));
    uint g256 = clamp(uint(max(grainSize, 0.0) * 256.0), 1u, 32768u);
    vec3 result;

#if MODE == 0
    // Pointillize: one dot per jittered Voronoi cell (cellSize px),
    // colored and sized from the image at that cell's own seed
    // point; darker seed colors get bigger dots. Background is
    // paperColor. The dot edge blends over 2 px on each side, close to
    // the 1.5 * fwidth(d) it used before.
    uint c256 = clamp(uint(max(cellSize, 0.0) * 256.0), 1u, 65535u);
    uvec2 g = center / c256;
    ivec2 f = ivec2(((center - g * c256) << uvec2(12u)) / c256);
    // Jittered-grid Voronoi in 12-bit cell units: seed point = cell + 0.5 +
    // (hash - 0.5) * 0.9. Search radius is one ring of neighbor cells, so
    // the jitter stays within [0, 1] for the nearest seed to be in the window.
    int best = 0x7fffffff;
    ivec2 bestPt = ivec2(0);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            ivec2 cell = ivec2(x, y);
            uvec2 h = pcg3d(uvec3(uvec2(ivec2(g) + cell), s)).xy >> uvec2(16u);
            ivec2 pt = cell * 4096 + 205 + ivec2(((h * 9u) / 10u) >> uvec2(4u));
            ivec2 dv = pt - f;
            int dd = dv.x * dv.x + dv.y * dv.y;
            if (dd < best) {
                best = dd;
                bestPt = pt;
            }
        }
    }
    // Seed point in 1/256 px, measured from the cell to the lower left so
    // the offset stays positive; the dot's color is the texel under it.
    ivec2 seed256 = (ivec2(g) - 1) * int(c256) + ivec2((uvec2(bestPt + 4096) * c256) >> uvec2(12u));
    ivec2 seedTexel = clamp((max(seed256, ivec2(0)) >> 8) - ivec2(tileOffset), ivec2(0), texSize - 1);
    vec3 seedColor = texelFetch(inputTex, seedTexel, 0).rgb;
    int radius = 1434 + int((1638u * (65535u - lum16(seedColor))) >> 16u);
    int d = int(isqrt(uint(best)));
    int aa = int(2097152u / c256);
    uint t = d <= radius - aa ? 0u : (d >= radius + aa ? 4096u : (uint(d - radius + aa) << 12u) / uint(2 * aa));
    uint inside = 4096u - smooth12(t);
    uvec3 paper = uvec3(unorm16(paperColor.r), unorm16(paperColor.g), unorm16(paperColor.b));
    uvec3 ink = uvec3(unorm16(seedColor.r), unorm16(seedColor.g), unorm16(seedColor.b));
    result = vec3((paper * (4096u - inside) + ink * inside) >> uvec3(12u)) / 65536.0;
#elif MODE == 1 || MODE == 2 || MODE == 3
    // Mezzotint dots/lines/strokes: per-channel hard threshold
    // against shaped value noise. density biases the threshold (n)
    // directly, so higher density raises n and lowers the fraction
    // of channel values that clear it - i.e. more ink.
    uvec2 pos = center;
    uint grain = g256;
#if MODE == 3
    // Rotate 45 degrees: x' = (x + y) / sqrt2, y' = (y - x) / sqrt2. The
    // 1 / sqrt2 moves into the grain size (92682 = sqrt2 * 65536).
    pos = uvec2((px.x + px.y + 1u) * 256u, (px.y + 1048576u - px.x) * 256u);
    grain = (g256 * 92682u + 32768u) >> 16u;
#endif
    uvec2 lattice;
#if MODE == 1
    lattice = uvec2(grain);
#else
    // Anisotropic (line) noise: the Y component keeps the coarse
    // (grainSize*8) scale and X keeps the fine (grainSize) scale,
    // so the field is coherent/slowly-varying down each column
    // and decorrelates quickly across a row - i.e. streaks
    // elongated along Y (vertical). Swapped from a
    // literal x-coarse/y-fine reading of the spec, which was
    // verified (lag-1 luma autocorrelation on a solid-color
    // source region: 0.94 along X vs 0.49 along Y before this
    // swap) to render HORIZONTAL streaks instead.
    lattice = uvec2(grain, grain * 8u);
#endif
    uint n = vnoise(pos, lattice, s);
    result = vec3(inkStep(n, unorm16(src.r), d256), inkStep(n, unorm16(src.g), d256), inkStep(n, unorm16(src.b), d256));
#else
    // Reticulation: two-tone ink/paper tonemap against clumped fBm
    // noise; the noise amplitude is luminance-modulated so shadows
    // fill in with broad dense clumps and highlights break into
    // fine grain. density biases the ink/paper balance using the
    // exact same (density-50)/100 term the mezzo branch applies to
    // its threshold, since clumpNoise vs l is structurally the same
    // threshold-vs-value pairing as mezzo's n vs channel.
    uint l = lum16(src.rgb);
    // Amplitude mix(1.2, 0.6, l) in 1/65536 units.
    uint amp = 78643u - ((39322u * l) >> 16u);
    uint clumpNoise = (fbm(center, g256, s) * (amp >> 2u)) >> 14u;
    result = inkStep(clumpNoise, l, d256) > 0.5 ? vec3(0.97) : vec3(0.05);
#endif

    fragColor = vec4(result, src.a);
}
