#version 300 es
precision highp float;

// Fill the frame with the background colour before the mesh is drawn.

uniform vec4 background;

out vec4 fragColor;

void main() {
    fragColor = background;
}
