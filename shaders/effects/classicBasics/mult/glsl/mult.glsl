#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform float amount;

out vec4 fragColor;

/* Multiplies inputTex by tex scaled by amount. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 a = texture(inputTex, st);
  vec3 mask = texture(tex, st).rgb;
  float mixAmount = clamp(amount, 0.0, 1.0);
  vec3 blended = mix(vec3(1.0), mask, mixAmount);
  fragColor = vec4(a.rgb * blended, a.a);
}
