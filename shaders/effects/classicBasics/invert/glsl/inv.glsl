#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float a;

out vec4 fragColor;

/* Mixes original color with its inverse. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 c = texture(inputTex, st);
  vec3 inv = 1.0 - c.rgb;
  vec3 rgb = mix(c.rgb, inv, a);
  fragColor = vec4(rgb,1.0);
}
