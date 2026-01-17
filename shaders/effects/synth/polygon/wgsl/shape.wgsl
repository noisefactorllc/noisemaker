// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> sides: i32;
@group(0) @binding(3) var<uniform> radius: f32;
@group(0) @binding(4) var<uniform> smoothing: f32;
@group(0) @binding(5) var<uniform> rotation: f32;
@group(0) @binding(6) var<uniform> fgColor: vec3<f32>;
@group(0) @binding(7) var<uniform> fgAlpha: f32;
@group(0) @binding(8) var<uniform> bgColor: vec3<f32>;
@group(0) @binding(9) var<uniform> bgAlpha: f32;

const PI: f32 = 3.14159265359;

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
  // Apply rotation
  let c = cos(rotation * PI / 180.0);
  let s = sin(rotation * PI / 180.0);
  st = vec2<f32>(st.x * c - st.y * s, st.x * s + st.y * c);
  let sidesF = f32(max(sides, 3));
  let d = polygon(st, sidesF);
  let m = smoothstep(radius, radius - smoothing, d);
  
  // fgAlpha scales foreground visibility, bgAlpha scales background visibility
  let fgMask = m * fgAlpha;
  let bgMask = (1.0 - m) * bgAlpha;
  let totalAlpha = fgMask + bgMask;
  
  // Compute color as weighted blend (for non-zero alpha)
  var outColor: vec3<f32>;
  if (totalAlpha > 0.0) {
      outColor = (fgColor * fgMask + bgColor * bgMask) / totalAlpha;
  } else {
      outColor = vec3<f32>(0.0);
  }
  
  // Output premultiplied alpha for correct compositing
  return vec4<f32>(outColor * totalAlpha, totalAlpha);
}
