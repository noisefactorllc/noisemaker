#version 300 es

/*
 * Background generator shader.
 * Renders solid, linear, and radial gradients with optional rotation so modules downstream have a predictable backdrop.
 * Opacity and rotation inputs are mapped from UI units to normalized ranges to avoid artifacts on high resolution canvases.
 */

precision highp float;
precision highp int;

uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform int backgroundType;
uniform float rotation;
uniform vec4 color1;
uniform vec4 color2;
uniform float opacity;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec2 rotate2D(vec2 st, float rot) {
    rot = map(rot, -180.0, 180.0, -1.0, 1.0);
    float angle = rot * PI;
    st.x *= aspectRatio;
    st -= vec2(aspectRatio * 0.5, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(aspectRatio * 0.5, 0.5);
    st.x /= aspectRatio;
    return st;
}

void main() {
    vec4 color = color1;
    vec2 st = gl_FragCoord.xy / resolution;

    vec2 centered = st * vec2(aspectRatio, 1.0);
    centered -= vec2(aspectRatio * 0.5, 0.5);

    st = rotate2D(st, rotation);

    if (backgroundType == 0) {
        // solid
        color = color1;
    } else if (backgroundType == 10) {
        // horizontal gradient 1 -> 2
        color = mix(color2, color1, st.y);
    } else if (backgroundType == 11) {
        // horizontal gradient 2 -> 1
        color = mix(color1, color2, st.y);
    } else if (backgroundType == 20) {
        // vertical gradient 1 -> 2
        color = mix(color1, color2, st.x);
    } else if (backgroundType == 21) {
        // vertical gradient 2 -> 1
        color = mix(color2, color1, st.x);
    } else if (backgroundType == 30) {
        // radial gradient 1 -> 2
        color = mix(color1, color2, length(centered));
    } else if (backgroundType == 31) {
        // radial gradient 2 -> 1
        color = mix(color2, color1, length(centered));
    }

    color.a = opacity * 0.01;

    fragColor = color;
}
