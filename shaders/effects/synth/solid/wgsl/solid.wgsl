// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> color: vec3<f32>;
@group(0) @binding(1) var<uniform> alpha: f32;

/* Produces a constant color with premultiplied alpha. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  // Premultiply RGB by alpha for correct compositing
  return vec4<f32>(color * alpha, alpha);
}
