/*
 * Light Leak: Voronoi-based colored light leak with wormhole distortion,
 * bloom approximation, screen blend, center mask, and vaseline blur.
 */

#ifdef GL_ES
precision highp float;
#endif

const float TAU = 6.28318530717958647692;
const int POINT_COUNT = 6;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float alpha;
uniform vec3 color;
uniform float speed;
uniform int seed;
uniform float time;

out vec4 fragColor;

// PCG PRNG
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

float hash31(vec3 p) {
    uvec3 v = uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        uint(p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0)
    );
    return float(pcg(v).x) / float(0xffffffffu);
}

vec3 hash33(vec3 p) {
    uvec3 v = uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        uint(p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0)
    );
    uvec3 h = pcg(v);
    return vec3(
        float(h.x) / float(0xffffffffu),
        float(h.y) / float(0xffffffffu),
        float(h.z) / float(0xffffffffu)
    );
}

float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

// Voronoi: find nearest of 6 seed-based points, return cell color + distance
void voronoiCell(vec2 uv, float seed_f, float t, out vec3 cell_color, out float cell_dist) {
    float best_dist = 1e9;
    int best_index = 0;
    float drift = 0.05;

    for (int i = 0; i < POINT_COUNT; i++) {
        vec3 s = vec3(seed_f, float(i) * 7.31, 0.0);
        vec2 base = hash33(s).xy;
        vec2 osc = vec2(
            sin(t * 0.7 + float(i) * 1.618),
            cos(t * 0.5 + float(i) * 2.236)
        ) * drift;
        vec2 pt = fract(base + osc);
        vec2 delta = abs(uv - pt);
        vec2 wd = min(delta, 1.0 - delta);
        float dist = dot(wd, wd);
        if (dist < best_dist) {
            best_dist = dist;
            best_index = i;
        }
    }

    vec3 s = vec3(seed_f + 100.0, float(best_index) * 13.37, 5.0);
    cell_color = mix(hash33(s), color, 0.6);
    cell_dist = best_dist;
}

// Chebyshev center mask: 0 at center, 1 at edges
float centerMask(vec2 uv) {
    vec2 centered = abs(uv - 0.5);
    float dist = max(centered.x, centered.y);
    return clamp(dist * 2.0, 0.0, 1.0);
}

void main() {
    ivec2 coords = ivec2(gl_FragCoord.xy);
    ivec2 tileDims = textureSize(inputTex, 0);
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : vec2(tileDims);
    vec2 uv = (gl_FragCoord.xy + tileOffset) / fullRes;

    vec4 base = texelFetch(inputTex, coords, 0);
    float blend_alpha = clamp(alpha, 0.0, 1.0);
    if (blend_alpha <= 0.0) {
        fragColor = base;
        return;
    }

    float seed_f = float(seed);
    float t = time * speed;

    // Voronoi at current position (for wormhole direction)
    vec3 base_cell;
    float base_dist;
    voronoiCell(uv, seed_f, t, base_cell, base_dist);

    // Wormhole distortion
    float luma = luminance(base_cell);
    float angle = luma * TAU + t * speed * 0.5;
    vec2 warp = vec2(cos(angle), sin(angle)) * 0.25;
    vec2 warped_uv = fract(uv + warp);

    // Voronoi at warped position
    vec3 warp_cell;
    float warp_dist;
    voronoiCell(warped_uv, seed_f, t, warp_cell, warp_dist);

    // Approximate bloom using distance falloff
    float glow = exp(-warp_dist * 12.0);
    vec3 bloom_color = mix(warp_cell, warp_cell * 1.3, glow);

    // Mix wormhole result with bloom
    vec3 leak = clamp(mix(sqrt(clamp(warp_cell, vec3(0.0), vec3(1.0))), bloom_color, 0.55), vec3(0.0), vec3(1.0));

    // Screen blend: 1 - (1 - base) * (1 - leak)
    vec3 screened = vec3(1.0) - (vec3(1.0) - base.rgb) * (vec3(1.0) - leak);

    // Center mask: leak is stronger away from center
    float mask = pow(centerMask(uv), 4.0);
    vec3 masked = mix(base.rgb, screened, mask);

    // Vaseline-style soft blur via neighbor texel fetches
    vec3 soft_accum = masked * 4.0;
    float soft_w = 4.0;
    ivec2 nb0 = clamp(coords + ivec2(2, 0), ivec2(0), tileDims - 1);
    ivec2 nb1 = clamp(coords + ivec2(-2, 0), ivec2(0), tileDims - 1);
    ivec2 nb2 = clamp(coords + ivec2(0, 2), ivec2(0), tileDims - 1);
    ivec2 nb3 = clamp(coords + ivec2(0, -2), ivec2(0), tileDims - 1);
    soft_accum += texelFetch(inputTex, nb0, 0).rgb;
    soft_accum += texelFetch(inputTex, nb1, 0).rgb;
    soft_accum += texelFetch(inputTex, nb2, 0).rgb;
    soft_accum += texelFetch(inputTex, nb3, 0).rgb;
    soft_w += 4.0;
    vec3 vaseline = soft_accum / soft_w;

    // Final blend with alpha
    vec3 final_color = mix(base.rgb, mix(masked, vaseline, blend_alpha), blend_alpha);
    fragColor = vec4(clamp(final_color, vec3(0.0), vec3(1.0)), base.a);
}
