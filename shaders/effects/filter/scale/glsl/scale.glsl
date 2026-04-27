#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float scaleX;
uniform float scaleY;
uniform float centerX;
uniform float centerY;
uniform int wrap;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Scales UVs around an arbitrary center point. */
void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  vec2 c = vec2(-centerX, centerY);
  st -= c;
  st.x *= aspect;
  st = st / vec2(scaleX, scaleY);
  st.x /= aspect;
  st += c;
  
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
