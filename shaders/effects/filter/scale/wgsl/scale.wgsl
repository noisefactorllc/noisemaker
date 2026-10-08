// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> scaleX: f32;
@group(0) @binding(5) var<uniform> scaleY: f32;
@group(0) @binding(6) var<uniform> centerX: f32;
@group(0) @binding(7) var<uniform> centerY: f32;
@group(0) @binding(8) var<uniform> wrap: i32;
@group(0) @binding(9) var<uniform> tileOffset: vec2<f32>;
@group(0) @binding(10) var<uniform> fullResolution: vec2<f32>;

/* Scales UVs around an arbitrary center point. */
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  // Compute global UV from tile-local coordinates
  let globalCoord = position.xy + tileOffset;
  var st = globalCoord / fullResolution;
  let center = vec2<f32>(centerX, centerY);
  st -= center;
  st.x *= aspect;
  st /= vec2<f32>(scaleX, scaleY);
  st.x /= aspect;
  st += center;
  
  // Convert global UV to local UV for sampling inputTex
  var localUV = (st * fullResolution - tileOffset) / resolution;
  
  // Apply wrap mode to local UV
  if (wrap == 0) {
      // mirror
      localUV = abs((localUV + 1.0) - 2.0 * floor((localUV + 1.0) / 2.0) - 1.0);
  } else if (wrap == 1) {
      // repeat
      localUV = fract(localUV);
  } else {
      // clamp
      localUV = clamp(localUV, vec2<f32>(0.0), vec2<f32>(1.0));
  }
  
  let color = textureSample(inputTex, samp, localUV).rgb;
  return vec4<f32>(color, 1.0);
}
