// WGSL version – WebGPU
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> a: f32;

/* Mixes original color with its inverse. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex));
  let c = textureSample(inputTex, samp, st);
  let inv = vec3<f32>(1.0) - c.rgb;
  let rgb = mix(c.rgb, inv, a);
  return vec4<f32>(rgb, 1.0);
}
