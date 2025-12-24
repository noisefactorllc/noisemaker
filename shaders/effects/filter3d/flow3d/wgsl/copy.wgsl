/*
 * Flow3D copy pass (WGSL) - Blit source to destination (for ping-pong correction after diffuse)
 * This ensures the decayed trail is in the write buffer before deposit blends onto it
 */

@group(0) @binding(0) var sourceTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(position.xy);
    return textureLoad(sourceTex, coord, 0);
}
