#version 300 es
precision highp float;

uniform float r;
uniform float g;
uniform float b;

out vec4 fragColor;

/* Produces a constant color. */
void main() {
  fragColor = vec4(r, g, b, 1.0);
}
