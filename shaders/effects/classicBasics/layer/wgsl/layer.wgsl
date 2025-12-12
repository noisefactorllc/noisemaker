// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;

/* Overlays tex atop inputTex using tex alpha. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = vec2<f32>(textureDimensions(inputTex, 0));
  let st = position.xy / size;
  let a = textureSample(inputTex, samp, st);
  let b = textureSample(tex, samp, st);
  let rgb = mix(a.rgb, b.rgb, b.a);
  return vec4<f32>(rgb, 1.0);
}
