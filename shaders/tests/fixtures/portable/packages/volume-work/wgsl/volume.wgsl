// Fill a volumeSize^3 volume, stored as a volumeSize x volumeSize^2 atlas:
// texel (x, y + z * volumeSize) is voxel (x, y, z), the catalog's layout.
// Voxel (x, y, z) holds (x, y, z) / (volumeSize - 1).

@group(0) @binding(0) var<uniform> volumeSize: i32;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let texel = vec2<i32>(position.xy);
    let voxel = vec3<i32>(texel.x, texel.y % volumeSize, texel.y / volumeSize);
    return vec4<f32>(vec3<f32>(voxel) / f32(volumeSize - 1), 1.0);
}
