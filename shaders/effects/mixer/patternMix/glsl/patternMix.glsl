#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int patternType;
uniform float scale;
uniform float thickness;
uniform float smoothness;
uniform float rotation;
uniform int invert;

out vec4 fragColor;

#define PI 3.14159265359
#define SQRT3 1.7320508075688772

#define CHECKERBOARD 0
#define CONCENTRIC_RINGS 1
#define DOTS 2
#define GRID 3
#define HEXAGONS 4
#define RADIAL_LINES 5
#define SPIRAL 6
#define STRIPES 7
#define TRIANGULAR_GRID 8

#define TAU 6.28318530718

vec2 rotate2D(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float stripes(vec2 p, float t) {
    float stripe = fract(p.x);
    float edge1 = smoothstep(0.5 - t * 0.5 - smoothness, 0.5 - t * 0.5 + smoothness, stripe);
    float edge2 = smoothstep(0.5 + t * 0.5 - smoothness, 0.5 + t * 0.5 + smoothness, stripe);
    return edge1 - edge2;
}

float checkerboard(vec2 p, float sm) {
    vec2 f = fract(p);
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    vec2 cell = floor(p);
    float check = mod(cell.x + cell.y, 2.0);
    float edge = smoothstep(0.0, sm * 0.5, d);
    return mix(1.0 - check, check, edge);
}

float grid(vec2 p, float t) {
    vec2 f = fract(p);
    float lineX = smoothstep(t * 0.5 - smoothness, t * 0.5 + smoothness, abs(f.x - 0.5));
    float lineY = smoothstep(t * 0.5 - smoothness, t * 0.5 + smoothness, abs(f.y - 0.5));
    return 1.0 - min(lineX, lineY);
}

float dots(vec2 p, float t) {
    vec2 f = fract(p) - 0.5;
    float d = length(f);
    float radius = t * 0.5;
    return 1.0 - smoothstep(radius - smoothness, radius + smoothness, d);
}

float hexDist(vec2 p) {
    p = abs(p);
    return max(p.x * 0.5 + p.y * (SQRT3 / 2.0), p.x);
}

float hexagons(vec2 p, float t) {
    vec2 s = vec2(1.0, SQRT3);
    vec2 h = s * 0.5;
    vec2 a = mod(p, s) - h;
    vec2 b = mod(p + h, s) - h;
    vec2 g = length(a) < length(b) ? a : b;
    float d = hexDist(g);
    float edge = 0.5 * t;
    return smoothstep(edge + smoothness, edge - smoothness, d);
}

// Concentric rings pattern
float concentricRings(vec2 p, float t) {
    float d = fract(length(p));
    float edge1 = smoothstep(0.5 - t * 0.5 - smoothness, 0.5 - t * 0.5 + smoothness, d);
    float edge2 = smoothstep(0.5 + t * 0.5 - smoothness, 0.5 + t * 0.5 + smoothness, d);
    return edge1 - edge2;
}

// Radial lines pattern
float radialLines(vec2 p, float t) {
    float lineCount = max(1.0, floor(20.0 * t));
    float angle = atan(p.y, p.x);
    float d = fract(angle / TAU * lineCount);
    float edge1 = smoothstep(0.5 - 0.25 - smoothness, 0.5 - 0.25 + smoothness, d);
    float edge2 = smoothstep(0.5 + 0.25 - smoothness, 0.5 + 0.25 + smoothness, d);
    return edge1 - edge2;
}

// Triangular grid pattern
float triangularGrid(vec2 p, float t) {
    // Skew for equilateral triangles
    vec2 skewed = vec2(p.x - p.y / SQRT3, p.y * 2.0 / SQRT3);
    vec2 cell = floor(skewed);
    vec2 f = fract(skewed);

    // Distance to nearest edge of the triangle
    float d;
    if (f.x + f.y < 1.0) {
        d = min(min(f.x, f.y), 1.0 - f.x - f.y);
    } else {
        d = min(min(1.0 - f.x, 1.0 - f.y), f.x + f.y - 1.0);
    }

    float edge = (1.0 - t) * 0.4;
    return smoothstep(edge - smoothness, edge + smoothness, d);
}

// Spiral pattern
float spiralPattern(vec2 p, float t) {
    float dist = length(p);
    float angle = atan(p.y, p.x);
    float d = fract(angle / TAU + dist);
    float edge1 = smoothstep(0.5 - t * 0.5 - smoothness, 0.5 - t * 0.5 + smoothness, d);
    float edge2 = smoothstep(0.5 + t * 0.5 - smoothness, 0.5 + t * 0.5 + smoothness, d);
    return edge1 - edge2;
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    // Center and aspect-correct using full image coordinates
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    float aspect = fullRes.x / fullRes.y;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / fullRes;
    vec2 p = (globalUV - 0.5) * 2.0;
    p.x *= aspect;

    // Apply rotation
    float rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Apply scale (lower scale = higher frequency, matching synth/pattern)
    p *= (21.0 - scale);

    // Compute pattern mask
    float m = 0.0;
    if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == CONCENTRIC_RINGS) {
        m = concentricRings(p, thickness);
    } else if (patternType == DOTS) {
        m = dots(p, thickness);
    } else if (patternType == GRID) {
        m = grid(p, thickness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness);
    } else if (patternType == RADIAL_LINES) {
        m = radialLines(p, thickness);
    } else if (patternType == SPIRAL) {
        m = spiralPattern(p, thickness);
    } else if (patternType == STRIPES) {
        m = stripes(p, thickness);
    } else if (patternType == TRIANGULAR_GRID) {
        m = triangularGrid(p, thickness);
    }

    // Invert swaps which input shows in the pattern
    if (invert == 1) {
        m = 1.0 - m;
    }

    // Mix: m=0 shows A, m=1 shows B
    vec4 color = mix(colorA, colorB, m);
    color.a = max(colorA.a, colorB.a);

    fragColor = color;
}
