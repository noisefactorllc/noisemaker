#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float x;
uniform float y;
uniform float speedX;
uniform float speedY;
uniform float time;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Scrolls texture coordinates with wraparound. */
void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  st.x *= aspect;
  vec2 offset = vec2(x + time * speedX, y + time * speedY);
  offset.x *= aspect;
  st += offset;
  st.x /= aspect;
  st = fract(st);
  fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
