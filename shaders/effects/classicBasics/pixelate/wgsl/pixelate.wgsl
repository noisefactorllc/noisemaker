// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> x: f32;
@group(0) @binding(5) var<uniform> y: f32;

/* Quantizes UVs to create a blocky look. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  st.x = st.x * aspect;
  let size = vec2<f32>(x, y);
  st = floor(st * size) / size;
  st.x = st.x / aspect;
  return vec4<f32>(textureSample(inputTex, samp, st).rgb, 1.0);
}
