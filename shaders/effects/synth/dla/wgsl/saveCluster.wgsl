// DLA - Save Cluster Pass (deposit agents)

@group(0) @binding(0) var agentTex: texture_2d<f32>;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> deposit: f32;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) v_weight: f32,
    @location(1) v_color: vec3<f32>,
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
    let color = textureLoad(colorTex, coord, 0);
    let weight = clamp(state.w, 0.0, 1.0);
    
    var out: VertexOutput;
    out.v_weight = weight;
    out.v_color = color.rgb;
    
    if (weight < 0.5) {
        out.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
        return out;
    }
    
    // state.xy contains position in [0,1] range
    var clip = state.xy * 2.0 - 1.0;
    clip.y = -clip.y; // Flip Y for WebGPU NDC
    out.position = vec4<f32>(clip, 0.0, 1.0);
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    if (in.v_weight < 0.5) {
        discard;
    }
    
    // Energy deposit controlled by uniform, using sampled color
    let energy = in.v_weight * deposit;
    
    return vec4<f32>(in.v_color * energy, energy);
}
