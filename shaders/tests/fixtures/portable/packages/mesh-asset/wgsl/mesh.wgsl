// One vertex per texel of the mesh textures, as glsl/mesh.vert draws it. The
// clip-space y is negated so the mesh lands in the same texture rows as on
// WebGL2; the backend culls with clockwise front faces to match.

@group(0) @binding(0) var meshPositions: texture_2d<f32>;
@group(0) @binding(1) var meshNormals: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let width = i32(textureDimensions(meshPositions, 0).x);
    let texel = vec2<i32>(i32(vertexIndex) % width, i32(vertexIndex) / width);
    let position = textureLoad(meshPositions, texel, 0);
    var out: VertexOutput;
    out.normal = textureLoad(meshNormals, texel, 0).xyz;
    if (position.w < 0.5) {
        out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);
        return out;
    }
    out.position = vec4<f32>(position.x, -position.y, position.z * 0.25 + 0.5, 1.0);
    return out;
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(abs(normalize(in.normal)), 1.0);
}
