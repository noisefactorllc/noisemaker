struct Uniforms {
    resolution: vec2<f32>,
    _pad: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@group(0) @binding(0) var agentTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    let width = i32(uniforms.resolution.x);
    let height = i32(uniforms.resolution.y);

    let id = i32(vertexIndex);
    let x = id % width;
    let y = id / width;

    if (y >= height) {
        output.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
        return output;
    }

    let agent = textureLoad(agentTex, vec2<i32>(x, y), 0);
    let pos = agent.xy;
    let life = agent.w;

    // Only draw alive agents
    if (life <= 0.0) {
        output.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
        return output;
    }

    output.position = vec4<f32>(pos * 2.0 - 1.0, 0.0, 1.0);

    return output;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    // Deposit a small amount per agent hit
    return vec4<f32>(0.15, 0.15, 0.15, 1.0);
}
