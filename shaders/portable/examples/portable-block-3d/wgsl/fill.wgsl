@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> volumeSize: i32;
struct Output { @location(0) color: vec4<f32>, @location(1) geoOut: vec4<f32>, }
@fragment fn main(@builtin(position) position: vec4<f32>) -> Output {
    let pixel = vec2<i32>(position.xy);
    let voxel = vec3<i32>(pixel.x, pixel.y % volumeSize, pixel.y / volumeSize);
    let solid = all(voxel >= vec3<i32>(4)) && all(voxel < vec3<i32>(12));
    var output: Output;
    output.color = select(vec4<f32>(0.0), vec4<f32>(1.0, 0.25, 0.75, 1.0), solid);
    output.geoOut = vec4<f32>(0.5, 1.0, 0.5, select(0.0, 1.0, solid));
    return output;
}
