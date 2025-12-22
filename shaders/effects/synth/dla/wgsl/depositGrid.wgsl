// DLA - Deposit stuck agents to anchor grid (WGSL)
// Only deposits agents that just stuck (vel.y == 1.0)

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) weight: f32,
    @location(1) color: vec3<f32>,
}

@group(0) @binding(0) var xyzTex: texture_2d<f32>;
@group(0) @binding(1) var velTex: texture_2d<f32>;
@group(0) @binding(2) var rgbaTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> deposit: f32;

fn decodeIndex(index: i32, dims: vec2<i32>) -> vec2<i32> {
    let x = index % dims.x;
    let y = index / dims.x;
    return vec2<i32>(x, y);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let dims = vec2<i32>(textureDimensions(xyzTex));
    let totalAgents = dims.x * dims.y;
    
    // Skip if vertex index exceeds agent count
    if (i32(vertexIndex) >= totalAgents) {
        output.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
        output.weight = 0.0;
        output.color = vec3<f32>(0.0);
        return output;
    }
    
    let coord = decodeIndex(i32(vertexIndex), dims);
    
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    
    // vel.y == 1.0 means this agent just stuck
    let justStuck = vel.y;
    
    output.weight = justStuck;
    output.color = rgba.rgb;
    
    // Only render if just stuck
    if (justStuck < 0.5) {
        output.position = vec4<f32>(-2.0, -2.0, 0.0, 1.0);
        return output;
    }
    
    // Position from xyz (normalized [0,1])
    let clip = xyz.xy * 2.0 - 1.0;
    output.position = vec4<f32>(clip, 0.0, 1.0);
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Discard if not a stuck agent
    if (in.weight < 0.5) {
        discard;
    }
    
    // Deposit energy with agent color
    // deposit range [0.5, 20] maps to energy [0.05, 2.0]
    let energy = deposit * 0.1;
    return vec4<f32>(in.color * energy, energy);
}
