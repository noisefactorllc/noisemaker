#version 300 es
precision highp float;

uniform float r;
uniform float g;
uniform float b;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Applies RGB tint or produces a solid color when no texture supplied. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(max(textureSize(inputTex,0), ivec2(1)));
  vec4 base = texture(inputTex, st);
  vec3 tint = vec3(r, g, b);
  vec3 rgb = mix(tint, base.rgb * tint, step(0.001, base.a));
  fragColor = vec4(rgb, 1.0);
}
