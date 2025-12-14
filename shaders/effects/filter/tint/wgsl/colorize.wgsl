// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> r: f32;
@group(0) @binding(3) var<uniform> g: f32;
@group(0) @binding(4) var<uniform> b: f32;

/* Applies RGB tint or produces a solid color when no texture supplied. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = max(textureDimensions(inputTex, 0), vec2<u32>(1, 1));
  let st = position.xy / vec2<f32>(size);
  let base = textureSample(inputTex, samp, st);
  let tint = vec3<f32>(r, g, b);
  let rgb = mix(tint, base.rgb * tint, step(0.001, base.a));
  return vec4<f32>(rgb, 1.0);
}
