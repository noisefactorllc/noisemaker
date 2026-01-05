#version 300 es
precision highp float;

// Clear the density texture to zero before deposit

out vec4 fragColor;

void main() {
    fragColor = vec4(0.0);
}
