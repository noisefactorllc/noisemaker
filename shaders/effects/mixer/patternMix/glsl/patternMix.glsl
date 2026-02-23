#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int patternType;
uniform float scale;
uniform float thickness;
uniform float smoothness;
uniform float rotation;
uniform int invert;

out vec4 fragColor;

#define PI 3.14159265359
#define SQRT3 1.7320508075688772

#define STRIPES 0
#define CHECKERBOARD 1
#define GRID 2
#define DOTS 3
#define HEXAGONS 4
#define DIAMONDS 5

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

float diamonds(vec2 p, float t) {
    float band = floor(p.x + p.y);
    float dir = mod(band, 2.0);
    vec2 rp = dir > 0.5 ? vec2(p.x - p.y, p.x + p.y) : vec2(p.x + p.y, p.y - p.x);
    rp *= 0.25;
    vec2 f = fract(rp * 2.0);
    float gap = (1.0 - t) * 0.4;
    float lineX = smoothstep(gap - smoothness, gap + smoothness, abs(f.x - 0.5));
    float lineY = smoothstep(gap - smoothness, gap + smoothness, abs(f.y - 0.5));
    return lineX * lineY;
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    // Center and aspect-correct
    float aspect = resolution.x / resolution.y;
    vec2 p = (st - 0.5) * 2.0;
    p.x *= aspect;

    // Apply rotation
    float rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Apply scale (lower scale = higher frequency, matching synth/pattern)
    p *= (21.0 - scale);

    // Compute pattern mask
    float m = 0.0;
    if (patternType == STRIPES) {
        m = stripes(p, thickness);
    } else if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == GRID) {
        m = grid(p, thickness);
    } else if (patternType == DOTS) {
        m = dots(p, thickness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness);
    } else if (patternType == DIAMONDS) {
        m = diamonds(p, thickness);
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
