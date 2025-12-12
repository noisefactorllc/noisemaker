// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> amount: f32;

/* Multiplies inputTex by tex scaled by amount. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex, 0));
  let a = textureSample(inputTex, samp, st);
  let mask = textureSample(tex, samp, st).rgb;
  let mixAmount = clamp(amount, 0.0, 1.0);
  let blended = mix(vec3<f32>(1.0), mask, mixAmount);
  return vec4<f32>(a.rgb * blended, a.a);
}
