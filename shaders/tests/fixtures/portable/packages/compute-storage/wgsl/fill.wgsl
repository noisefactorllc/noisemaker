// Write each pixel of the work texture through its storage binding: red and
// green hold its position times spacing, out of 255.

@group(0) @binding(0) var workTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> spacing: i32;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(workTex);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let texel = vec2<i32>(id.xy);
    textureStore(workTex, texel, vec4<f32>(vec2<f32>(texel * spacing) / 255.0, 0.0, 1.0));
}
