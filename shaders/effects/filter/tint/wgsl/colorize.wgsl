// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> color: vec3<f32>;
@group(0) @binding(3) var<uniform> alpha: f32;

/* Applies color tint to input texture with adjustable opacity. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = max(textureDimensions(inputTex, 0), vec2<u32>(1, 1));
  let st = position.xy / vec2<f32>(size);
  let base = textureSample(inputTex, samp, st);
  let tinted = base.rgb * color;
  let rgb = mix(base.rgb, tinted, alpha);
  return vec4<f32>(rgb, base.a);
}
