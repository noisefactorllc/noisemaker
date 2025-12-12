// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> n: f32;

/* Kaleidoscope effect by folding angle into n symmetric slices. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  st -= vec2<f32>(0.5, 0.5);
  st.x = st.x * aspect;
  let r = length(st);
  var a = atan2(st.y, st.x);
  let m = 6.2831853 / n;
  a = a - m * floor(a / m);
  var uv = vec2<f32>(cos(a), sin(a)) * r;
  uv.x = uv.x / aspect;
  uv += vec2<f32>(0.5, 0.5);
  let rgb = textureSample(inputTex, samp, uv).rgb;
  return vec4<f32>(rgb, 1.0);
}
