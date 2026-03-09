#version 300 es

precision highp float;
precision highp int;

// Stray Hair - sparse dark curved lines over the image.
// Procedural bezier-curve hairs with anti-aliased thin lines.

uniform sampler2D inputTex;
uniform float time;
uniform float density;
uniform int seed;
uniform float alpha;

in vec2 v_texCoord;
out vec4 fragColor;

// Integer-based hash for seed-driven randomness
float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 hash2(float n) {
    return vec2(hash(n), hash(n + 71.37));
}

// Minimum distance from point p to cubic bezier (a, b, c, d)
// Approximated by sampling along the curve
float bezierDist(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
    float minDist = 1e10;
    const int STEPS = 16;
    for (int j = 0; j <= STEPS; j++) {
        float t = float(j) / float(STEPS);
        float it = 1.0 - t;
        vec2 q = it * it * it * a
               + 3.0 * it * it * t * b
               + 3.0 * it * t * t * c
               + t * t * t * d;
        float dist = length(p - q);
        minDist = min(minDist, dist);
    }
    return minDist;
}

void main() {
    vec4 baseColor = texture(inputTex, v_texCoord);
    vec2 dims = vec2(textureSize(inputTex, 0));
    float aspect = dims.x / dims.y;

    // Work in aspect-corrected UV space
    vec2 uv = v_texCoord;
    uv.x *= aspect;

    float seedF = float(seed) * 7.919;
    int numHairs = 2 + int(floor(density * 6.0));

    float hairMask = 0.0;

    // Line width in UV space (~1.5 pixels)
    float lineWidth = 1.5 / dims.y;

    for (int i = 0; i < 8; i++) {
        if (i >= numHairs) break;

        float idx = seedF + float(i) * 137.31;

        // Start position
        vec2 p0 = hash2(idx + 11.0);
        p0.x *= aspect;

        // Direction angle and length
        float angle = hash(idx + 99.0) * 6.28318;
        float len = 0.25 + hash(idx + 55.0) * 0.35;

        // End position
        vec2 p3 = p0 + vec2(cos(angle), sin(angle)) * len;

        // Control points with kink (perpendicular offsets for curvature)
        float kink1 = (hash(idx + 33.0) - 0.5) * 0.15;
        float kink2 = (hash(idx + 77.0) - 0.5) * 0.15;
        vec2 perp = vec2(-sin(angle), cos(angle));
        vec2 along = vec2(cos(angle), sin(angle));

        vec2 p1 = p0 + along * len * 0.33 + perp * kink1;
        vec2 p2 = p0 + along * len * 0.66 + perp * kink2;

        float dist = bezierDist(uv, p0, p1, p2, p3);

        // Anti-aliased thin line
        float strand = 1.0 - smoothstep(0.0, lineWidth, dist);
        hairMask = max(hairMask, strand);
    }

    // Blend: darken input where hair is present
    // Python ref: blend(tensor, brightness * 0.333, mask * 0.666)
    float blendFactor = hairMask * alpha;
    vec3 darkened = baseColor.rgb * 0.333;
    vec3 result = mix(baseColor.rgb, darkened, blendFactor);

    fragColor = vec4(result, baseColor.a);
}
