// WGSL version – WebGPU
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> color: vec3<f32>;
@group(0) @binding(3) var<uniform> alpha: f32;
@group(0) @binding(4) var<uniform> mode: f32;

fn rgb_to_hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.x; let g = rgb.y; let b = rgb.z;
    let max_c = max(max(r, g), b);
    let min_c = min(min(r, g), b);
    let delta = max_c - min_c;
    var hue = 0.0;
    if (delta != 0.0) {
        if (max_c == r) {
            var raw = (g - b) / delta;
            raw = raw - floor(raw / 6.0) * 6.0;
            if (raw < 0.0) { raw = raw + 6.0; }
            hue = raw;
        } else if (max_c == g) {
            hue = (b - r) / delta + 2.0;
        } else {
            hue = (r - g) / delta + 4.0;
        }
    }
    hue = hue / 6.0;
    if (hue < 0.0) { hue = hue + 1.0; }
    var sat = 0.0;
    if (max_c != 0.0) { sat = delta / max_c; }
    return vec3<f32>(hue, sat, max_c);
}

fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = hsv.x; let s = hsv.y; let v = hsv.z;
    let dh = h * 6.0;
    let dr = clamp(abs(dh - 3.0) - 1.0, 0.0, 1.0);
    let dg = clamp(-abs(dh - 2.0) + 2.0, 0.0, 1.0);
    let db = clamp(-abs(dh - 4.0) + 2.0, 0.0, 1.0);
    let oms = 1.0 - s;
    return vec3<f32>((oms + s * dr) * v, (oms + s * dg) * v, (oms + s * db) * v);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = max(textureDimensions(inputTex, 0), vec2<u32>(1, 1));
  let st = position.xy / vec2<f32>(size);
  let base = textureSample(inputTex, samp, st);
  let base_rgb = clamp(base.rgb, vec3<f32>(0.0), vec3<f32>(1.0));

  let m = i32(mode);
  var tinted: vec3<f32>;
  if (m == 1) {
      // Multiply
      tinted = base_rgb * color;
  } else if (m == 2) {
      // Recolor: replace hue with tint color's hue
      let tintHue = rgb_to_hsv(color).x;
      let base_hsv = rgb_to_hsv(base_rgb);
      tinted = clamp(hsv_to_rgb(vec3<f32>(tintHue, clamp(base_rgb.y, 0.0, 1.0), clamp(base_hsv.z, 0.0, 1.0))), vec3<f32>(0.0), vec3<f32>(1.0));
  } else {
      // Overlay (default)
      tinted = color;
  }

  let rgb = mix(base_rgb, tinted, vec3<f32>(alpha));
  return vec4<f32>(rgb, base.a);
}
