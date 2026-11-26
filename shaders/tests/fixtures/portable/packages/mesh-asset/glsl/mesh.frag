#version 300 es
precision highp float;

// The absolute value of the unit normal is the colour.

in vec3 vNormal;

out vec4 fragColor;

void main() {
    fragColor = vec4(abs(normalize(vNormal)), 1.0);
}
