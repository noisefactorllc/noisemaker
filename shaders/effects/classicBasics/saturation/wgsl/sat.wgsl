// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> a: f32;

/* Adjusts sat by mixing with luminance. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex, 0));
  let c = textureSample(inputTex, samp, st);
  let l = dot(c.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let rgb = mix(vec3<f32>(l), c.rgb, a);
  return vec4<f32>(rgb, 1.0);
}
