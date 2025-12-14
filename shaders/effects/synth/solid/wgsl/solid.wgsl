// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> r: f32;
@group(0) @binding(1) var<uniform> g: f32;
@group(0) @binding(2) var<uniform> b: f32;

/* Produces a constant color. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(r, g, b, 1.0);
}
