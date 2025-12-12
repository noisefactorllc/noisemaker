#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float n;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Kaleidoscope effect by folding angle into n symmetric slices. */
void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  st -= 0.5;
  st.x *= aspect;
  float r = length(st);
  float a = atan(st.y, st.x);
  float m = 6.2831853 / n;
  a = mod(a, m);
  vec2 uv = vec2(cos(a), sin(a)) * r;
  uv.x /= aspect;
  uv += 0.5;
  fragColor = vec4(texture(inputTex, uv).rgb, 1.0);
}
