#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float aspect;
uniform float x;
uniform float y;
uniform float speedX;
uniform float speedY;
uniform float time;
uniform int wrap;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Scrolls texture coordinates with wraparound. */
void main(){
  vec2 globalCoord = gl_FragCoord.xy + tileOffset;
  vec2 st = globalCoord / fullResolution;
  st.x *= aspect;
  vec2 offset = vec2(-x + time * -speedX, y + time * speedY);
  offset.x *= aspect;
  st += offset;
  st.x /= aspect;
  
  // Apply wrap mode
  if (wrap == 0) {
      // mirror
      st = abs(mod(st + 1.0, 2.0) - 1.0);
  } else if (wrap == 1) {
      // repeat
      st = fract(st);
  } else {
      // clamp
      st = clamp(st, 0.0, 1.0);
  }
  
  fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
