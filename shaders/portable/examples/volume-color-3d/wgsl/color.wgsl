@group(0) @binding(0) var<uniform> amount: f32;
@group(0) @binding(1) var volumeInput: texture_2d<f32>;
@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let source = textureLoad(volumeInput, vec2<i32>(position.xy), 0);
    let tint = vec2<f32>(source.r * 0.4, source.r * 0.85);
    return vec4<f32>(source.r, mix(source.gb, tint, amount), source.a);
}
