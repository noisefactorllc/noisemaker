// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> a: f32;

/* Adds constant amount to RGB channels. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex, 0));
  let c = textureSample(inputTex, samp, st);
  let rgb = fract(c.rgb + vec3<f32>(a));
  return vec4<f32>(rgb, c.a);
}
