#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float level;
uniform float sharpness;

out vec4 fragColor;

/* Binary threshold with adjustable edge softness. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(textureSize(inputTex,0));
  vec4 c = texture(inputTex, st);
  float l = dot(c.rgb, vec3(0.299,0.587,0.114));
  float e = smoothstep(level - sharpness, level + sharpness, l);
  fragColor = vec4(vec3(e),1.0);
}
