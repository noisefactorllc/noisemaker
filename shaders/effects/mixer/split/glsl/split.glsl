#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float position;
uniform float rotation;
uniform float softness;
uniform int invert;
uniform float speed;
uniform float time;

out vec4 fragColor;

#define PI 3.14159265359

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 st = gl_FragCoord.xy / resolution;
    vec2 globalST = globalCoord / fullResolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    float aspect = fullResolution.x / fullResolution.y;
    vec2 centered = (globalST - 0.5) * 2.0;
    centered.x *= aspect;

    // Rotate the split line
    float rad = rotation * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);
    vec2 rotated = vec2(centered.x * c - centered.y * s,
                        centered.x * s + centered.y * c);

    // Compute visible extent of rotated.y for seamless scrolling
    // The projected range depends on aspect ratio and rotation angle
    float extent = aspect * abs(s) + abs(c) + softness;

    // Animate: continuous scroll across full visible range
    // Alternates sweep direction each cycle so the wrap point is seamless
    float animPos = position;
    bool flipCycle = false;
    if (speed > 0.0) {
        float cycle = time * speed * 2.0;
        float t = fract(cycle);
        flipCycle = mod(floor(cycle), 2.0) == 1.0;
        animPos = t * extent * 2.0 - extent;
    }

    // Signed distance from the split line
    float d = rotated.y - animPos;

    // Apply softness
    float halfSoft = max(softness * 0.5, 0.001);
    float mask = smoothstep(-halfSoft, halfSoft, d);

    if ((invert == 1) != flipCycle) {
        mask = 1.0 - mask;
    }

    vec4 color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    fragColor = color;
}
