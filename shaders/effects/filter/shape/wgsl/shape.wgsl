// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> sides: f32;
@group(0) @binding(3) var<uniform> radius: f32;
@group(0) @binding(4) var<uniform> smoothing: f32;

/* Regular polygon distance field built from polar math; draws a soft-edged shape. */
fn polygon(st: vec2<f32>, sides: f32) -> f32 {
  let a = atan2(st.y, st.x) + 3.14159265;
  let r = 6.2831853 / sides;
  return cos(floor(0.5 + a / r) * r - a) * length(st);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var st = position.xy / resolution;
  st = (st - vec2<f32>(0.5, 0.5)) * 2.0;
  st.x *= aspect;
  let d = polygon(st, sides);
  let m = smoothstep(radius, radius - smoothing, d);
  return vec4<f32>(vec3<f32>(m), 1.0);
}
