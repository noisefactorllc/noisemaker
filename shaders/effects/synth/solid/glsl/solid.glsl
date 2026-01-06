#version 300 es
precision highp float;

uniform float r;
uniform float g;
uniform float b;
uniform float a;

out vec4 fragColor;

/* Produces a constant color. */
void main() {
  fragColor = vec4(r, g, b, a);
}
