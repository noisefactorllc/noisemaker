// DLA - Save Cluster Pass (deposit agents)
// Vertex shader reads agent positions from state texture
// Fragment shader writes cluster color to output

@group(0) @binding(0) var agentTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> alpha: f32;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) v_weight: f32,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexID: u32) -> VertexOutput {
    let dims = textureDimensions(agentTex);
    let w = i32(dims.x);
    let h = i32(dims.y);
    
    let x = i32(vertexID) % w;
    let y = i32(vertexID) / w;
    let coord = vec2<i32>(x, y);
    
    let state = textureLoad(agentTex, coord, 0);
    let weight = clamp(state.w, 0.0, 1.0);
    
    var out: VertexOutput;
    out.v_weight = weight;
    
    if (weight < 0.5) {
        out.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
        return out;
    }
    
    // state.xy contains position in [0,1] range
    let clip = state.xy * 2.0 - 1.0;
    out.position = vec4<f32>(clip, 0.0, 1.0);
    return out;
}

fn falloff(coord: vec2<f32>) -> f32 {
    let centered = coord * 2.0 - 1.0;
    let d = dot(centered, centered);
    return clamp(1.0 - d, 0.0, 1.0);
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    if (in.v_weight < 0.5) {
        discard;
    }
    
    let energy = in.v_weight * clamp(alpha + 0.1, 0.0, 1.2);
    
    // Mono output: grayscale only
    return vec4<f32>(energy, energy, energy, energy);
}
