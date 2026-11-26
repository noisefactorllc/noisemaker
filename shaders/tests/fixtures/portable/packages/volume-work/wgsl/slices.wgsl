// Show the volume's z slices side by side, as glsl/slices.glsl does.

@group(0) @binding(0) var volumeCache: texture_2d<f32>;
@group(0) @binding(1) var<uniform> volumeSize: i32;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let pixel = vec2<i32>(position.xy);
    let columns = max(1, i32(resolution.x) / volumeSize);
    let tile = pixel / volumeSize;
    let z = tile.y * columns + tile.x;
    if (tile.x >= columns || z >= volumeSize) {
        return vec4<f32>(0.0);
    }
    let inSlice = pixel - tile * volumeSize;
    return textureLoad(volumeCache, vec2<i32>(inSlice.x, inSlice.y + z * volumeSize), 0);
}
