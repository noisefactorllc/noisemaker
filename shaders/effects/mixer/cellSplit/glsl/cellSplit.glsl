#version 300 es
precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int mode;
uniform float scale;
uniform float edgeWidth;
uniform int seed;
uniform int invert;

out vec4 fragColor;

// PCG PRNG - MIT License
// https://github.com/riccardoscalco/glsl-pcg-prng
uvec3 pcg(uvec3 v) {
    v = v * uint(1664525) + uint(1013904223);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> uint(16);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    // Aspect-correct, scaled coordinates
    float aspect = resolution.x / resolution.y;
    vec2 p = st * (31.0 - scale);
    p.x *= aspect;

    vec2 cellCoord = floor(p);
    vec2 cellFract = fract(p);

    // Find nearest and second-nearest cell centers
    float d1 = 1e10;
    float d2 = 1e10;
    float nearestHash = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = cellCoord + neighbor;
            vec3 rnd = prng(vec3(cellId, float(seed)));
            vec2 point = neighbor + rnd.xy - cellFract;
            float dist = dot(point, point);

            if (dist < d1) {
                d2 = d1;
                d1 = dist;
                nearestHash = rnd.z;
            } else if (dist < d2) {
                d2 = dist;
            }
        }
    }

    // Sharp edge detection at cell boundaries
    float edgeDist = sqrt(d2) - sqrt(d1);
    float onEdge = edgeWidth > 0.0 ? step(edgeDist, edgeWidth) : 0.0;

    float mask;
    if (mode == 0) {
        // Edges mode: cells show A, edges show B
        mask = onEdge;
    } else {
        // Split mode: cells randomly assigned to A or B, edges show 50/50
        float cellChoice = step(0.5, nearestHash);
        if (invert == 1) {
            cellChoice = 1.0 - cellChoice;
        }
        mask = mix(cellChoice, 0.5, onEdge);
    }

    // Apply invert (in edges mode, swaps cells/edges assignment)
    if (mode == 0 && invert == 1) {
        mask = 1.0 - mask;
    }

    vec4 color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    fragColor = color;
}
