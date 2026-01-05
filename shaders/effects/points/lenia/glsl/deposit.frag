#version 300 es
precision highp float;

uniform float depositAmount;

out vec4 fragColor;

void main() {
    // Each particle deposits a constant value
    // The kernel convolution will spread this according to K(r)
    fragColor = vec4(depositAmount, 0.0, 0.0, 1.0);
}
