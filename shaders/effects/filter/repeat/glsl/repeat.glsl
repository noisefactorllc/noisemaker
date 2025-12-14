#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float x;
uniform float y;
uniform float offsetX;
uniform float offsetY;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Tiles the input texture across the screen. */
void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  st.x *= aspect;
  st = st * vec2(x, y) + vec2(offsetX * aspect, offsetY);
  st.x /= aspect;
  st = fract(st);
  fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
