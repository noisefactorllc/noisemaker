// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> r: f32;
@group(0) @binding(1) var<uniform> g: f32;
@group(0) @binding(2) var<uniform> b: f32;
@group(0) @binding(3) var<uniform> a: f32;

/* Produces a constant color with premultiplied alpha. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  // Premultiply RGB by alpha for correct compositing
  return vec4<f32>(r * a, g * a, b * a, a);
}
