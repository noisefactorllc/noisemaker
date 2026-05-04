#version 300 es
precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int mode;
uniform float scale;
uniform float edgeWidth;
uniform int seed;
uniform int invert;
uniform float time;
uniform float speed;

out vec4 fragColor;

const float TAU = 6.28318530718;

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

    // Aspect-correct, scaled coordinates using full image dimensions
    // so Voronoi cells are consistent across tiles
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    float aspect = fullRes.x / fullRes.y;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / fullRes;
    vec2 p = globalUV * (31.0 - scale);
    p.x *= aspect;

    float spd = floor(speed);
    vec2 cellCoord = floor(p);
    vec2 cellFract = fract(p);

    // Pass 1: find nearest cell center
    float d1 = 1e10;
    vec2 nearestPoint = vec2(0.0);
    vec2 nearestCell = vec2(0.0);
    float nearestHash = 0.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = cellCoord + neighbor;
            vec3 rnd = prng(vec3(cellId, float(seed)));
            vec2 wobble = sin(TAU * time * spd + rnd.xy * TAU) * 0.15 * min(spd, 1.0);
            vec2 point = neighbor + rnd.xy + wobble - cellFract;
            float dist = dot(point, point);

            if (dist < d1) {
                d1 = dist;
                nearestPoint = point;
                nearestCell = cellId;
                nearestHash = rnd.z;
            }
        }
    }

    // Pass 2: find minimum perpendicular distance to any Voronoi edge
    // (bisector between nearest center and each neighbor center)
    float edgeDist = 1e10;
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = cellCoord + neighbor;
            if (cellId == nearestCell) continue;
            vec3 rnd = prng(vec3(cellId, float(seed)));
            vec2 wobble = sin(TAU * time * spd + rnd.xy * TAU) * 0.15 * min(spd, 1.0);
            vec2 point = neighbor + rnd.xy + wobble - cellFract;
            // Perpendicular distance to bisector between nearest and this neighbor
            vec2 mid = (nearestPoint + point) * 0.5;
            vec2 edge = normalize(point - nearestPoint);
            float d = abs(dot(mid, edge));
            edgeDist = min(edgeDist, d);
        }
    }

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
