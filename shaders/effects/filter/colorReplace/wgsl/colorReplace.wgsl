// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> targetColor: vec3<f32>;
@group(0) @binding(3) var<uniform> replaceColor: vec3<f32>;
@group(0) @binding(4) var<uniform> sensitivity: f32;
@group(0) @binding(5) var<uniform> smoothing: f32;
@group(0) @binding(6) var<uniform> colorMix: f32;
@group(0) @binding(7) var<uniform> replaceAlpha: f32;
@group(0) @binding(8) var<uniform> keepAlpha: f32;

/* Color replacement.
   Matches input pixels by euclidean RGB distance to targetColor, then
   independently remaps RGB toward replaceColor and rescales alpha. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = max(textureDimensions(inputTex, 0), vec2<u32>(1u, 1u));
  let st = position.xy / vec2<f32>(size);
  let src = textureSampleLevel(inputTex, samp, st, 0.0);

  let dist = length(src.rgb - targetColor) / 1.7320508;

  let halfBand = smoothing * 0.5;
  let edge0 = max(sensitivity - halfBand, 0.0);
  let edge1 = sensitivity + halfBand;
  let match_ = 1.0 - smoothstep(edge0, edge1, dist);

  let outRgb = mix(src.rgb, replaceColor, vec3<f32>(match_ * colorMix));
  let outA = src.a * mix(keepAlpha, replaceAlpha, match_);

  return vec4<f32>(outRgb, outA);
}
