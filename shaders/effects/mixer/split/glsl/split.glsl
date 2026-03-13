#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float position;
uniform float rotation;
uniform float softness;
uniform int invert;
uniform float speed;
uniform float time;

out vec4 fragColor;

#define PI 3.14159265359

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    float aspect = resolution.x / resolution.y;
    vec2 centered = (st - 0.5) * 2.0;
    centered.x *= aspect;

    // Rotate the split line
    float rad = rotation * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);
    vec2 rotated = vec2(centered.x * c - centered.y * s,
                        centered.x * s + centered.y * c);

    // Animate position with wipe
    float animPos = position;
    if (speed > 0.0) {
        animPos += sin(time * 2.0 * PI * speed);
    }

    // Signed distance from the split line
    float d = rotated.y - animPos;

    // Apply softness
    float halfSoft = max(softness * 0.5, 0.001);
    float mask = smoothstep(-halfSoft, halfSoft, d);

    if (invert == 1) {
        mask = 1.0 - mask;
    }

    vec4 color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    fragColor = color;
}
