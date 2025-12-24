// Deposit Shader - Scatter agents to trail texture

struct Uniforms {
    resolution: vec2<f32>,
    deposit: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var rgbaTex: texture_2d<f32>;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // Get state size from xyz texture dimensions (inherited from pointsEmit)
    let texSize = textureDimensions(xyzTex, 0);
    let stateSize = i32(texSize.x);
    let totalAgents = stateSize * stateSize;
    
    // Cull vertices beyond texture size
    if (i32(vertexIndex) >= totalAgents) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        return out;
    }
    
    // Calculate UV for this agent
    let x = i32(vertexIndex) % stateSize;
    let y = i32(vertexIndex) / stateSize;
    
    // Read agent position and color
    let pos = textureLoad(xyzTex, vec2<i32>(x, y), 0);
    let col = textureLoad(rgbaTex, vec2<i32>(x, y), 0);
    
    // Check if agent is alive (pos.w >= 0.5 means alive)
    if (pos.w < 0.5) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        return out;
    }
    
    // Convert position (0..1) to clip space (-1..1)
    // WebGPU Y is flipped vs WebGL2 - flip Y to match
    let clipPos = vec2<f32>(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0);
    
    out.position = vec4<f32>(clipPos, 0.0, 1.0);
    
    // Apply deposit amount
    out.color = vec4<f32>(col.rgb * u.deposit, col.a * u.deposit);
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
