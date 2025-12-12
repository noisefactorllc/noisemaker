#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float levels;
uniform float gamma;

out vec4 fragColor;

/* Reduces color depth with optional gamma correction. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 c = texture(inputTex, st);
  vec3 col = pow(c.rgb, vec3(gamma));
  col *= vec3(levels);
  col = floor(col);
  col /= vec3(levels);
  col = pow(col, vec3(1.0 / gamma));
  fragColor = vec4(col, 1.0);
}
