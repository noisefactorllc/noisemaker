#version 300 es
precision highp float;

// Deposit Fragment Shader - Output particle color

in vec4 vColor;

out vec4 fragColor;

void main() {
    // Deposit particle color with intensity
    float depositAmount = 0.15;
    fragColor = vec4(vColor.rgb * depositAmount, 1.0);
}
