#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float time;
uniform float angle;
uniform float speed;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Coordinate rotation about center; formula derived from basic 2x2 rotation matrix. */
void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  st -= 0.5;
  st.x *= aspect;
  float a = angle + time * speed;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  st = rot * st;
  st.x /= aspect;
  st += 0.5;
  fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
