#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float scale;
uniform float offset;

out vec4 fragColor;

/* Extracts green channel as grayscale. */
void main(){
  vec2 st = (gl_FragCoord.xy - 0.5) / vec2(textureSize(inputTex,0));
  vec4 c = texture(inputTex, st);
  float v = fract(c.g * scale + offset);
  fragColor = vec4(vec3(v), 1.0);
}
