#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float sides;
uniform float radius;
uniform float smoothing;

out vec4 fragColor;

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
  float d = polygon(st, sides);
  float m = smoothstep(radius, radius - smoothing, d);
  fragColor = vec4(vec3(m),1.0);
}
