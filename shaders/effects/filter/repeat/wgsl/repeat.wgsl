// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> x: f32;
@group(0) @binding(5) var<uniform> y: f32;
@group(0) @binding(6) var<uniform> offsetX: f32;
@group(0) @binding(7) var<uniform> offsetY: f32;
@group(0) @binding(8) var<uniform> wrap: i32;

/* Tiles the input texture across the screen. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  st.x = st.x * aspect;
  st = st * vec2<f32>(x, y) + vec2<f32>(offsetX * aspect, offsetY);
  st.x = st.x / aspect;
  
  // Apply wrap mode
  if (wrap == 0) {
      // mirror
      st = abs((st % 2.0 + 2.0) % 2.0 - 1.0);
  } else if (wrap == 1) {
      // repeat
      st = (st % 1.0 + 1.0) % 1.0;
  } else {
      // clamp
      st = clamp(st, vec2<f32>(0.0), vec2<f32>(1.0));
  }
  
  return vec4<f32>(textureSample(inputTex, samp, st).rgb, 1.0);
}
