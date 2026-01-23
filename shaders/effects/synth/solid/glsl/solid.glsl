#version 300 es
precision highp float;

uniform vec3 color;
uniform float alpha;

out vec4 fragColor;

/* Produces a constant color with premultiplied alpha. */
void main() {
  // Premultiply RGB by alpha for correct compositing
  fragColor = vec4(color * alpha, alpha);
}
