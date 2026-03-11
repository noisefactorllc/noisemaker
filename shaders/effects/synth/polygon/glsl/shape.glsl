#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform int sides;
uniform float radius;
uniform float smoothing;
uniform float rotation;
uniform vec3 fgColor;
uniform float fgAlpha;
uniform vec3 bgColor;
uniform float bgAlpha;

out vec4 fragColor;

#define PI 3.14159265359

/* Regular polygon distance field built from polar math; draws a soft-edged shape. */
float polygon(vec2 st, float sides){
  float a = atan(st.y, st.x) + 3.14159265;
  float r = 6.2831853 / sides;
  return cos(floor(0.5 + a/r)*r - a) * length(st);
}

void main(){
  vec2 st = gl_FragCoord.xy / resolution;
  st = (st - 0.5) * 2.0;
  st.x *= aspect;
  // Apply rotation
  float c = cos(rotation * PI / 180.0);
  float s = sin(rotation * PI / 180.0);
  st = vec2(st.x * c - st.y * s, st.x * s + st.y * c);
  float sidesF = float(max(sides, 3));
  // Rotate triangle so vertex points up
  if (sides == 3) {
      st = vec2(st.y, -st.x);
  }
  // Normalize by inradius so all shapes have consistent size
  float d = polygon(st, sidesF) / cos(PI / sidesF);
  float m = smoothstep(radius, radius - smoothing, d);
  
  // fgAlpha scales foreground visibility, bgAlpha scales background visibility
  float fgMask = m * fgAlpha;
  float bgMask = (1.0 - m) * bgAlpha;
  float totalAlpha = fgMask + bgMask;
  
  // Compute color as weighted blend (for non-zero alpha)
  vec3 outColor = totalAlpha > 0.0 
      ? (fgColor * fgMask + bgColor * bgMask) / totalAlpha
      : vec3(0.0);
  
  // Output premultiplied alpha for correct compositing
  fragColor = vec4(outColor * totalAlpha, totalAlpha);
}
