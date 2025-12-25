// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> x: f32;
@group(0) @binding(5) var<uniform> y: f32;
@group(0) @binding(6) var<uniform> speedX: f32;
@group(0) @binding(7) var<uniform> speedY: f32;
@group(0) @binding(8) var<uniform> time: f32;
@group(0) @binding(9) var<uniform> wrap: i32;

/* Scrolls texture coordinates with wraparound. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  st.x *= aspect;
  var offset = vec2<f32>(x + time * speedX, y + time * speedY);
  offset.x *= aspect;
  st += offset;
  st.x /= aspect;
  
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
  
  let color = textureSample(inputTex, samp, st).rgb;
  return vec4<f32>(color, 1.0);
}
