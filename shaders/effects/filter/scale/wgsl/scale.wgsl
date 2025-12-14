// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> scaleX: f32;
@group(0) @binding(5) var<uniform> scaleY: f32;
@group(0) @binding(6) var<uniform> centerX: f32;
@group(0) @binding(7) var<uniform> centerY: f32;

/* Scales UVs around an arbitrary center point. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  let center = vec2<f32>(centerX, centerY);
  st -= center;
  st.x *= aspect;
  st /= vec2<f32>(scaleX, scaleY);
  st.x /= aspect;
  st += center;
  let color = textureSample(inputTex, samp, st).rgb;
  return vec4<f32>(color, 1.0);
}
