// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> time: f32;
@group(0) @binding(5) var<uniform> angle: f32;
@group(0) @binding(6) var<uniform> speed: f32;

/* Coordinate rotation about center; formula derived from basic 2x2 rotation matrix. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  st = st - vec2<f32>(0.5, 0.5);
  st.x = st.x * aspect;
  let a = angle + time * speed;
  let rot = mat2x2<f32>(cos(a), -sin(a), sin(a), cos(a));
  st = rot * st;
  st.x = st.x / aspect;
  st = st + vec2<f32>(0.5, 0.5);
  return vec4<f32>(textureSample(inputTex, samp, st).rgb, 1.0);
}
