// A 4 x 4 grid of points, one per vertex, as glsl/points.vert draws it. The
// clip-space y is negated so the points land in the same texture rows as on
// WebGL2.

@group(0) @binding(0) var<uniform> resolution: vec2<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let column = i32(vertexIndex) % 4;
    let row = i32(vertexIndex) / 4;
    let pixel = floor(resolution * 0.25 * (vec2<f32>(f32(column), f32(row)) + 0.5)) + 0.5;
    let clip = pixel / resolution * 2.0 - 1.0;
    var out: VertexOutput;
    out.position = vec4<f32>(clip.x, -clip.y, 0.0, 1.0);
    out.color = vec4<f32>(f32(column) / 3.0, f32(row) / 3.0, 1.0, 1.0);
    return out;
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
