#version 300 es
precision highp float;

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform vec3 targetColor;
uniform vec3 replaceColor;
uniform float sensitivity;
uniform float smoothing;
uniform float colorMix;
uniform float replaceAlpha;
uniform float keepAlpha;

out vec4 fragColor;

/* Color replacement.
   Matches input pixels by euclidean RGB distance to targetColor, then
   independently remaps RGB toward replaceColor and rescales alpha. */
void main() {
  vec2 globalCoord = gl_FragCoord.xy + tileOffset;
  vec2 st = gl_FragCoord.xy / vec2(max(textureSize(inputTex, 0), ivec2(1)));
  vec4 src = texture(inputTex, st);

  // Normalized euclidean RGB distance (0 = exact match, 1 = max distance).
  float dist = length(src.rgb - targetColor) / 1.7320508;

  // Match strength: 1 at exact match, 0 beyond (sensitivity + smoothing/2).
  float halfBand = smoothing * 0.5;
  float edge0 = max(sensitivity - halfBand, 0.0);
  float edge1 = sensitivity + halfBand;
  float match = 1.0 - smoothstep(edge0, edge1, dist);

  vec3 outRgb = mix(src.rgb, replaceColor, match * colorMix);
  float outA = src.a * mix(keepAlpha, replaceAlpha, match);

  fragColor = vec4(outRgb, outA);
}
