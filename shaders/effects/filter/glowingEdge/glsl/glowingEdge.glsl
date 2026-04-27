#version 300 es

precision highp float;
precision highp int;

// Glowing Edge - single-pass effect that computes Sobel edges and applies glow

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float alpha;
uniform float sobelMetric;
uniform float width;

out vec4 fragColor;

float luminance(vec3 rgb) {
    return dot(rgb, vec3(0.299, 0.587, 0.114));
}

float distance_metric(float gx, float gy, int metric) {
    float abs_gx = abs(gx);
    float abs_gy = abs(gy);

    if (metric == 1) {
        return abs_gx + abs_gy;  // Manhattan
    } else if (metric == 2) {
        return max(abs_gx, abs_gy);  // Chebyshev
    } else if (metric == 3) {
        float cross = (abs_gx + abs_gy) / 1.414;
        return max(cross, max(abs_gx, abs_gy));  // Minkowski
    }
    return sqrt(gx * gx + gy * gy);  // Euclidean (0)
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = width / resolution;

    // Sample base color
    vec4 base = texture(inputTex, uv);

    // Sample 3x3 neighborhood for Sobel
    float tl = luminance(texture(inputTex, uv + vec2(-texel.x, -texel.y)).rgb);
    float tc = luminance(texture(inputTex, uv + vec2(0.0, -texel.y)).rgb);
    float tr = luminance(texture(inputTex, uv + vec2(texel.x, -texel.y)).rgb);
    float ml = luminance(texture(inputTex, uv + vec2(-texel.x, 0.0)).rgb);
    float mr = luminance(texture(inputTex, uv + vec2(texel.x, 0.0)).rgb);
    float bl = luminance(texture(inputTex, uv + vec2(-texel.x, texel.y)).rgb);
    float bc = luminance(texture(inputTex, uv + vec2(0.0, texel.y)).rgb);
    float br = luminance(texture(inputTex, uv + vec2(texel.x, texel.y)).rgb);

    // Sobel kernels
    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;

    // Edge magnitude
    int metric = int(sobelMetric);
    float edge = clamp(distance_metric(gx, gy, metric) * 3.0, 0.0, 1.0);

    // Glow: edges emit the base color as additive light
    vec3 glow = edge * base.rgb * 2.0;

    // Screen blend glow onto original: brighter where edges are
    vec3 result = vec3(1.0) - (vec3(1.0) - base.rgb) * (vec3(1.0) - glow);

    // Mix based on alpha
    vec3 mixed = mix(base.rgb, result, alpha);

    fragColor = vec4(clamp(mixed, 0.0, 1.0), base.a);
}
