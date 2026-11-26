// The overlay over the input, by its alpha times the alpha parameter, as
// glsl/washBlend.glsl does.

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var overlayTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> alpha : f32;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(i32(pos.x), i32(pos.y));
    let base = textureLoad(inputTex, coord, 0);
    let overlay = textureLoad(overlayTex, coord, 0);
    let a = overlay.a * alpha;
    return vec4<f32>(base.rgb * (1.0 - a) + overlay.rgb * a, base.a);
}
