export const DEFAULT_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`

export const FULLSCREEN_TRIANGLE_POSITIONS = new Float32Array([
    -1.0, -1.0,
     3.0, -1.0,
    -1.0,  3.0
])

export const FULLSCREEN_TRIANGLE_VERTEX_COUNT = 3

export const DEFAULT_VERTEX_SHADER_WGSL = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    let pos = positions[vertexIndex];

    var out: VertexOutput;
    out.position = vec4<f32>(pos, 0.0, 1.0);
    out.uv = pos * 0.5 + vec2<f32>(0.5, 0.5);
    return out;
}
`

export const DEFAULT_VERTEX_ENTRY_POINT = 'vs_main'
export const DEFAULT_FRAGMENT_ENTRY_POINT = 'main'
