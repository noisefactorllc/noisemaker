#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform float amount;

out vec4 fragColor;

/* Subtracts tex from inputTex scaled by amount, clamped to zero. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 a = texture(inputTex, st);
  vec3 b = texture(tex, st).rgb * amount;
  fragColor = vec4(max(a.rgb - b, 0.0), 1.0);
}
