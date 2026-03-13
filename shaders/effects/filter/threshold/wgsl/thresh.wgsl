// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> level: f32;
@group(0) @binding(3) var<uniform> sharpness: f32;

/* Binary threshold with adjustable edge softness. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let st = position.xy / vec2<f32>(textureDimensions(inputTex, 0));
  let c = textureSample(inputTex, samp, st);
  let l = dot(c.rgb, vec3<f32>(0.299, 0.587, 0.114));
  let e = smoothstep(level - sharpness, level + sharpness, l);
  return vec4<f32>(vec3<f32>(e), 1.0);
}
