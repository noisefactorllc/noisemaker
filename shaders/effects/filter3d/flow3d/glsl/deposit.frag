#version 300 es
precision highp float;
// Flow3D deposit fragment shader - outputs agent color at point position

in vec4 vColor;
out vec4 fragColor;

void main() {
    fragColor = vColor;
}
