// Read the work texture and write the output through its storage binding:
// red and green from the work texture, blue the complement of red.

@group(0) @binding(0) var work: texture_2d<f32>;
@group(0) @binding(1) var outputBuffer: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(outputBuffer);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }
    let texel = vec2<i32>(id.xy);
    let value = textureLoad(work, texel, 0);
    textureStore(outputBuffer, texel, vec4<f32>(value.r, value.g, 1.0 - value.r, 1.0));
}
