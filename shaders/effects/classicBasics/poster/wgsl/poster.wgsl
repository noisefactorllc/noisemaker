// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> levels: f32;
@group(0) @binding(3) var<uniform> gamma: f32;

/* Reduces color depth with optional gamma correction. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex, 0));
  let c = textureSample(inputTex, samp, st);
  var col = pow(c.rgb, vec3<f32>(gamma));
  col = col * vec3<f32>(levels);
  col = floor(col);
  col = col / vec3<f32>(levels);
  col = pow(col, vec3<f32>(1.0 / gamma));
  return vec4<f32>(col, 1.0);
}
