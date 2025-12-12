#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float x;
uniform float y;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Quantizes UVs to create a blocky look. */
void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  st.x *= aspect;
  vec2 size = vec2(x, y);
  st = floor(st * size) / size;
  st.x /= aspect;
  fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
