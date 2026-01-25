#version 300 es
precision highp float;

uniform vec3 color;
uniform float alpha;
uniform sampler2D inputTex;

out vec4 fragColor;

/* Applies color tint to input texture with adjustable opacity. */
void main(){
  vec2 st = gl_FragCoord.xy / vec2(max(textureSize(inputTex,0), ivec2(1)));
  vec4 base = texture(inputTex, st);
  vec3 tinted = base.rgb * color;
  vec3 rgb = mix(base.rgb, tinted, alpha);
  fragColor = vec4(rgb, base.a);
}
