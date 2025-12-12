#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float a;

out vec4 fragColor;

/* Adds constant amount to RGB channels. */
void main(){
  vec2 st = (gl_FragCoord.xy - 0.5) / vec2(textureSize(inputTex,0));
  vec4 c = texture(inputTex, st);
  vec3 rgb = fract(c.rgb + vec3(a));
  fragColor = vec4(rgb, c.a);
}
