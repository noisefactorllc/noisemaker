/*
 * Scatter - jitter pass (Diffuse / Spatter / frosted glass).
 * Each pixel samples the input at a random offset within [-radius, radius]
 * px on each axis, drawn from an integer hash (PCG3D) of the pixel's global
 * (tile-aware) coordinate and `seed`, and reads the input texel nearest that
 * offset position. `mode` selects how the offset is derived and how
 * the sampled pixel combines with the source pixel:
 *   normal (0)      - raw random offset; sampled value used directly.
 *   darkenOnly (1)  - raw random offset; min(src, sampled) per channel
 *                     (Diffuse Darken Only).
 *   lightenOnly (2) - raw random offset; max(src, sampled) per channel
 *                     (Diffuse Lighten Only).
 *   anisotropic (3) - the offset is projected onto the direction
 *                     perpendicular to the local luminance gradient, so the
 *                     scatter smears along edges/contours instead of
 *                     scattering isotropically (Diffuse
 *                     Anisotropic). Falls back to the raw offset where the
 *                     local gradient is ~zero (flat regions have no edge
 *                     direction to follow).
 *   clumped (4)     - the hash coordinate is quantized to 3px blocks before
 *                     hashing, so every pixel in a block shares the same
 *                     random offset, producing blocky clumps of shared
 *                     displacement instead of per-pixel grain.
 * scatterSmooth (the second pass) re-blends this pass's output with a 3x3
 * tent blur by `smoothness`.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

// MODE is a compile-time define injected by the runtime (see definition.js
// `globals.mode.define`), so the compiler drops the dead mode arms below.
#ifndef MODE
#define MODE 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform float radius;
uniform int seed;

out vec4 fragColor;

// PCG3D integer hash (Jarzynski & Olano 2020). Unsigned arithmetic wraps the
// same way on every compiler, so WebGL2 and WebGPU draw identical offsets; a
// float hash rounds and fuses differently per compiler and drifts apart.
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

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Sobel gradient of luminance; used by anisotropic mode to find the local
// edge direction (perpendicular to the gradient = along the edge).
vec2 lumGradient(vec2 uv) {
    vec2 px = 1.0 / resolution;
    float tl = lum(texture(inputTex, uv + px * vec2(-1.0,  1.0)).rgb);
    float  l = lum(texture(inputTex, uv + px * vec2(-1.0,  0.0)).rgb);
    float bl = lum(texture(inputTex, uv + px * vec2(-1.0, -1.0)).rgb);
    float tr = lum(texture(inputTex, uv + px * vec2( 1.0,  1.0)).rgb);
    float  r = lum(texture(inputTex, uv + px * vec2( 1.0,  0.0)).rgb);
    float br = lum(texture(inputTex, uv + px * vec2( 1.0, -1.0)).rgb);
    float  t = lum(texture(inputTex, uv + px * vec2( 0.0,  1.0)).rgb);
    float  b = lum(texture(inputTex, uv + px * vec2( 0.0, -1.0)).rgb);
    return vec2(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    ivec2 texel = ivec2(gl_FragCoord.xy);
    ivec2 texSize = textureSize(inputTex, 0);

    // Seed with the global (tile-aware) coordinate, not gl_FragCoord.xy
    // alone, so the scatter field is continuous across CLI render tiles
    // instead of restarting at each tile's local origin.
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;

    // Clumped mode: quantize the hash coordinate to 3px blocks BEFORE
    // hashing so every pixel in a block shares the same random offset.
    vec2 hashCoord = globalCoord;
    #if MODE == 4
        hashCoord = floor(globalCoord / 3.0) * 3.0;
    #endif

    uvec3 h = pcg3d(uvec3(uvec2(ivec2(floor(hashCoord))), uint(seed)));

    // Offset in 1/256 px steps, in [-radius, radius) on each axis: the top 16
    // hash bits scale the span 2 * radius * 256 in integers. radius * 256 is
    // exact; the 128 px cap (far above the 25 px slider maximum) keeps the
    // product within 32 bits.
    uint r256 = uint(min(abs(radius), 128.0) * 256.0);
    uvec2 steps = ((h.xy >> uvec2(16u)) * (2u * r256)) >> uvec2(16u);
    vec2 offset = vec2(ivec2(steps) - int(r256)) / 256.0;

    #if MODE == 3
        // Anisotropic: project the offset onto the direction perpendicular
        // to the local luminance gradient (edge-following smear).
        vec2 grad = lumGradient(uv);
        float gradLen = length(grad);
        if (gradLen > 1e-5) {
            vec2 perp = vec2(-grad.y, grad.x) / gradLen;
            offset = dot(offset, perp) * perp;
        }
        // else: gradient ~zero (flat region) -- fall back to raw offset.
    #endif

    // Read the texel nearest the offset sample position, clamped to the edge.
    // Outside anisotropic mode the offset is a multiple of 1/256, so
    // offset + 0.5 and its floor are exact on both backends.
    ivec2 sampleTexel = clamp(texel + ivec2(floor(offset + 0.5)), ivec2(0), texSize - 1);

    vec4 src = texelFetch(inputTex, texel, 0);
    vec4 samp = texelFetch(inputTex, sampleTexel, 0);

    vec4 result = samp;
    #if MODE == 1
        result = min(src, samp);
    #elif MODE == 2
        result = max(src, samp);
    #endif

    fragColor = result;
}
