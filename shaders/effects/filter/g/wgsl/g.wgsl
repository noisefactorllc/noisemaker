// WGSL version – WebGPU
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> scale: f32;
@group(0) @binding(4) var<uniform> offset: f32;

/* Extracts green channel as grayscale. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex));
  let c = textureSample(inputTex, samp, st);
  let v = fract(c.g * scale + offset);
  return vec4<f32>(vec3<f32>(v), 1.0);
}
