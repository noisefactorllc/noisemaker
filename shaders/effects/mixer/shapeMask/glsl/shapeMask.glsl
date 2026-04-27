#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int shape;
uniform float radius;
uniform float edgeSmooth;
uniform float rotation;
uniform float posX;
uniform float posY;
uniform int invert;
uniform int speed;
uniform float time;

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

float sdfTriangle(vec2 p, float r) {
    float k = 1.732050808; // sqrt(3)
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

float sdfFlower(vec2 p, float r) {
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

float sdfStar5(vec2 p, float r) {
    float rf = 0.4;
    vec2 k1 = vec2(0.809016994375, -0.587785252292);
    vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float sdfRing(vec2 p, float r) {
    float ringWidth = r * 0.15;
    return abs(length(p) - r) - ringWidth;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 st = gl_FragCoord.xy / resolution;
    vec2 globalST = globalCoord / fullResolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    // Centered, aspect-correct coordinates
    float aspect = fullResolution.x / fullResolution.y;
    vec2 p = (globalST - 0.5) * 2.0;
    p.x *= aspect;

    // Apply position offset
    p -= vec2(posX * aspect, -posY);

    // Apply rotation
    float rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Animate radius: pulse in and out
    float r = radius;
    if (speed > 0) {
        r = radius * 0.5 + sin(time * TAU * float(speed)) * radius * 0.5;
    }

    // Evaluate SDF
    float d = 0.0;
    if (shape == 0) {
        d = sdfCircle(p, r);
    } else if (shape == 1) {
        d = sdfTriangle(p, r);
    } else if (shape == 2) {
        d = sdfPolygon(p, r, 4.0);
    } else if (shape == 3) {
        d = sdfPolygon(p, r, 5.0);
    } else if (shape == 4) {
        d = sdfPolygon(p, r, 6.0);
    } else if (shape == 5) {
        d = sdfFlower(p, r);
    } else if (shape == 6) {
        d = sdfRing(p, r);
    } else if (shape == 7) {
        d = sdfStar5(p, r);
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
