#version 300 es
precision highp float;
in float v_weight;
layout(location = 0) out vec4 dlaOutColor;
uniform float alpha;

float falloff(vec2 coord) {
  vec2 centered = coord * 2.0 - 1.0;
  float d = dot(centered, centered);
  return clamp(1.0 - d, 0.0, 1.0);
}

void main() {
  if (v_weight < 0.5) {
    discard;
  }
  float shape = falloff(gl_PointCoord);
  float energy = v_weight * shape * clamp(alpha + 0.1, 0.0, 1.2);
  // Mono output: grayscale only
  dlaOutColor = vec4(energy, energy, energy, energy);
}
