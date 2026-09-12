#version 300 es
precision highp float;
precision highp int;
uniform sampler2D tilesTex;
uniform int shapeMode;
uniform float aperture;
uniform int viewMode;
out vec4 fragColor;

float shapeCoverage(vec2 uv) {
    // Procedural SDF shapes
    vec2 p = uv - 0.5;
    float sdf;
    float alpha;

    if (shapeMode == 1) {
        // Circle
        sdf = length(p) - 0.45;
    } else if (shapeMode == 2) {
        // Ring
        sdf = abs(length(p) - 0.35) - 0.08;
    } else if (shapeMode == 3) {
        // Square
        sdf = max(abs(p.x), abs(p.y)) - 0.4;
    } else if (shapeMode == 4) {
        // Diamond
        sdf = abs(p.x) + abs(p.y) - 0.45;
    } else if (shapeMode == 5) {
        // Equilateral triangle (Inigo Quilez SDF)
        float r = 0.25;
        float k = 1.732050808; // sqrt(3)
        vec2 t = vec2(abs(p.x) - r, p.y - 0.04 + r / k);
        if (t.x + k * t.y > 0.0) t = vec2(t.x - k * t.y, -k * t.x - t.y) / 2.0;
        t.x -= clamp(t.x, -2.0 * r, 0.0);
        sdf = -length(t) * sign(t.y);
    } else if (shapeMode == 6) {
        // 5-point star (Inigo Quilez SDF — straight edges)
        float r = 0.35;
        float rf = 0.4;
        vec2 k1 = vec2(0.809016994375, -0.587785252292);
        vec2 k2 = vec2(-k1.x, k1.y);
        vec2 s = vec2(abs(p.x), p.y);
        s -= 2.0 * max(dot(k1, s), 0.0) * k1;
        s -= 2.0 * max(dot(k2, s), 0.0) * k2;
        s.x = abs(s.x);
        s.y -= r;
        vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
        float h = clamp(dot(s, ba) / dot(ba, ba), 0.0, r);
        sdf = length(s - ba * h) * sign(s.y * ba.x - s.x * ba.y);
    } else {
        // Soft (7) — gaussian falloff
        alpha = exp(-dot(p, p) * 8.0);
        return alpha;
    }

    alpha = 1.0 - smoothstep(-0.02, 0.02, sdf);
    return alpha;
}

void main() {
    if (aperture <= 0.0 || viewMode == 0) { fragColor = vec4(0.0); return; }
    if (shapeMode != 0) {
        // Integrate once per frame, rather than repeating the same 25 SDF
        // evaluations at every pixel of every blurred particle.
        float coverage = 0.0;
        for (int y = 0; y < 5; y++) {
            for (int x = 0; x < 5; x++) {
                coverage += shapeCoverage((vec2(x, y) + 0.5) / 5.0);
            }
        }
        fragColor = vec4(coverage / 25.0);
        return;
    }
    ivec2 origin = ivec2(gl_FragCoord.xy) * 32;
    vec4 total = vec4(0.0);
    for (int y = 0; y < 32; y++) {
        for (int x = 0; x < 32; x++) {
            total += texelFetch(tilesTex, origin + ivec2(x, y), 0);
        }
    }
    fragColor = total;
}
