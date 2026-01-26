#version 300 es
precision highp float;

// Clear pass - fill with background color

uniform vec3 bgColor;

out vec4 fragColor;

void main() {
    fragColor = vec4(bgColor, 1.0);
}
