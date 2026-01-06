#version 300 es
precision highp float;

uniform float r;
uniform float g;
uniform float b;
uniform float a;

out vec4 fragColor;

/* Produces a constant color with premultiplied alpha. */
void main() {
  // Premultiply RGB by alpha for correct compositing
  fragColor = vec4(r * a, g * a, b * a, a);
}
