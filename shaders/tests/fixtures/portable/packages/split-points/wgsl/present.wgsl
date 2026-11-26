// Copy the frame to the output, texel for texel.

@group(0) @binding(0) var frameTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    return textureLoad(frameTex, vec2<i32>(position.xy), 0);
}
