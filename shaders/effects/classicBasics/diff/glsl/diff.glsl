#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;

out vec4 fragColor;

/* Absolute difference between two textures. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 a = texture(inputTex, st);
  vec4 b = texture(tex, st);
  vec3 rgb = abs(a.rgb - b.rgb);
  fragColor = vec4(rgb, 1.0);
}
