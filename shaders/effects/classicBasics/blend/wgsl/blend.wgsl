// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> amount: f32;

/* Linear interpolation between two textures. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex, 0));
  let a = textureSample(inputTex, samp, st);
  let b = textureSample(tex, samp, st);
  let rgb = mix(a.rgb, b.rgb, amount);
  return vec4<f32>(rgb, 1.0);
}
