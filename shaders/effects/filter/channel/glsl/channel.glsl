#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform int channel;
uniform float scale;
uniform float offset;

out vec4 fragColor;

/* Extracts a single channel (r=0, g=1, b=2, a=3) as grayscale. */
void main(){
  vec2 st = (gl_FragCoord.xy - 0.5) / vec2(textureSize(inputTex, 0));
  vec4 c = texture(inputTex, st);
  
  float v;
  if (channel == 0) {
    v = c.r;
  } else if (channel == 1) {
    v = c.g;
  } else if (channel == 2) {
    v = c.b;
  } else {
    v = c.a;
  }
  
  v = fract(v * scale + offset);
  fragColor = vec4(vec3(v), 1.0);
}
