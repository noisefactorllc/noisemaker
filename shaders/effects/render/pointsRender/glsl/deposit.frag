#version 300 es
precision highp float;

// Deposit Fragment Shader - Output agent color to trail

in vec4 vColor;
out vec4 fragColor;

void main() {
    fragColor = vColor;
}
