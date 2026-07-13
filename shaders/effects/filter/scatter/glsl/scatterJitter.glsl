/*
 * Scatter - jitter pass (Diffuse / Spatter / frosted glass).
 * Each pixel samples the input at a random offset within [-radius, radius]
 * px on each axis, drawn from a 2D hash seeded by the pixel's global
 * (tile-aware) coordinate. `mode` selects how the offset is derived and how
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

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
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

    vec2 rnd = hash22(hashCoord + float(seed) * 101.7) - 0.5;
    vec2 offset = rnd * 2.0 * radius;

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

    vec2 sampleUV = clamp((gl_FragCoord.xy + offset) / resolution, 0.0, 1.0);

    vec4 src = texture(inputTex, uv);
    vec4 samp = texture(inputTex, sampleUV);

    vec4 result = samp;
    #if MODE == 1
        result = min(src, samp);
    #elif MODE == 2
        result = max(src, samp);
    #endif

    fragColor = result;
}
