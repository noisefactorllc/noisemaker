#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int shape;
uniform float radius;
uniform float edgeSmooth;
uniform float rotation;
uniform float posX;
uniform float posY;
uniform int invert;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

vec2 rotate2D(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float sdfCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdfPolygon(vec2 p, float r, float sides) {
    float a = atan(p.x, p.y) + PI;
    float seg = TAU / sides;
    return cos(floor(0.5 + a / seg) * seg - a) * length(p) - r;
}

float sdfStar(vec2 p, float r) {
    float outerR = r;
    float innerR = r * 0.45;
    float a = atan(p.x, p.y) + PI;
    float seg = TAU / 5.0;
    float halfSeg = seg * 0.5;
    float segAngle = mod(a, seg);
    float t = abs(segAngle - halfSeg) / halfSeg;
    float starR = mix(innerR, outerR, t);
    return length(p) - starR;
}

float sdfRing(vec2 p, float r) {
    float ringWidth = r * 0.15;
    return abs(length(p) - r) - ringWidth;
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    // Centered, aspect-correct coordinates
    float aspect = resolution.x / resolution.y;
    vec2 p = (st - 0.5) * 2.0;
    p.x *= aspect;

    // Apply position offset
    p -= vec2(posX * aspect, -posY);

    // Apply rotation
    float rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Evaluate SDF
    float d = 0.0;
    if (shape == 0) {
        d = sdfCircle(p, radius);
    } else if (shape == 1) {
        vec2 tp = vec2(p.x, p.y + radius * 0.17) * 1.5;
        d = sdfPolygon(tp, radius, 3.0);
    } else if (shape == 2) {
        d = sdfPolygon(p, radius, 4.0);
    } else if (shape == 3) {
        d = sdfPolygon(p, radius, 5.0);
    } else if (shape == 4) {
        d = sdfPolygon(p, radius, 6.0);
    } else if (shape == 5) {
        d = sdfStar(p, radius);
    } else if (shape == 6) {
        d = sdfRing(p, radius);
    }

    // Smoothstep mask: 0 inside, 1 outside
    float mask = smoothstep(-edgeSmooth, edgeSmooth, d);

    // Invert swaps inside/outside
    if (invert == 1) {
        mask = 1.0 - mask;
    }

    // A inside shape, B outside (before invert)
    vec4 color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    fragColor = color;
}
