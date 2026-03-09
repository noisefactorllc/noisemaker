#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
    // Deposit a small amount per agent hit - accumulates over time
    fragColor = vec4(0.15, 0.15, 0.15, 1.0);
}
