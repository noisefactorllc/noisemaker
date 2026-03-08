// Ridge effect.
// Parameterized ridge transform with configurable midpoint level.

const CHANNEL_COUNT : u32 = 4u;

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_buffer : array<f32>;
@group(0) @binding(2) var<uniform> level : f32;

fn ridge_transform(value : vec4<f32>, lvl : f32) -> vec4<f32> {
    let denom : f32 = max(lvl, 1.0 - lvl);
    let result : vec4<f32> = vec4<f32>(1.0) - abs(value - vec4<f32>(lvl)) / denom;
    return clamp(result, vec4<f32>(0.0), vec4<f32>(1.0));
}

fn write_pixel(base_index : u32, color : vec4<f32>) {
    output_buffer[base_index + 0u] = color.x;
    output_buffer[base_index + 1u] = color.y;
    output_buffer[base_index + 2u] = color.z;
    output_buffer[base_index + 3u] = color.w;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    // Derive dimensions from the bound input texture to avoid relying on uniforms
    let dims : vec2<u32> = textureDimensions(inputTex, 0);
    let width : u32 = dims.x;
    let height : u32 = dims.y;
    if (gid.x >= width || gid.y >= height) {
        return;
    }

    let coords : vec2<i32> = vec2<i32>(i32(gid.x), i32(gid.y));
    let texel : vec4<f32> = textureLoad(inputTex, coords, 0);
    let pixel_index : u32 = gid.y * width + gid.x;
    let base_index : u32 = pixel_index * CHANNEL_COUNT;

    // Apply ridge transform
    let ridged : vec4<f32> = ridge_transform(texel, level);
    let out_color : vec4<f32> = vec4<f32>(ridged.xyz, 1.0);

    write_pixel(base_index, out_color);
}
