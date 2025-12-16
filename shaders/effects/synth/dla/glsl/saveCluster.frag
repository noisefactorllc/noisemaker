#version 300 es
precision highp float;
uniform float deposit;
in float v_weight;
in vec3 v_color;
layout(location = 0) out vec4 dlaOutColor;

void main() {
  if (v_weight < 0.5) {
    discard;
  }
  // Energy deposit controlled by uniform, using sampled color
  float energy = v_weight * deposit;
  dlaOutColor = vec4(v_color * energy, energy);
}
