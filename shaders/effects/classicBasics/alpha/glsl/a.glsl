#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float scale;
uniform float offset;

out vec4 fragColor;

/* Extracts alpha channel as grayscale. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 c = texture(inputTex, st);
  float v = c.a * scale + offset;
  fragColor = vec4(vec3(v), 1.0);
}
