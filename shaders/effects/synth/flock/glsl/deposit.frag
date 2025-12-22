#version 300 es
precision highp float;

in vec2 vUV;
in vec4 vColor;

out vec4 fragColor;

void main() {
    // Deposit boid color with fixed intensity
    float depositAmount = 0.1;
    fragColor = vec4(vColor.rgb * depositAmount, 1.0);
}
