// Flow deposit pass - positions agents as points and outputs their color
// Matches GLSL: deposit.vert + deposit.frag

@group(0) @binding(0) var stateTex1: texture_2d<f32>;
@group(0) @binding(1) var stateTex2: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> density: f32;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vColor: vec4<f32>,
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let agentIndex = i32(vertexIndex);
    let texWidth = i32(resolution.x);
    let texHeight = i32(resolution.y);
    
    // Calculate max agents based on density
    let maxDim = max(texWidth, texHeight);
    let maxAgents = i32(f32(maxDim) * density * 0.2);
    
    // Skip if beyond agent count
    if (agentIndex >= maxAgents) {
        output.position = vec4<f32>(2.0, 2.0, 0.0, 1.0); // Off-screen
        output.vColor = vec4<f32>(0.0);
        return output;
    }
    
    // Map agent index to state texture coordinate
    let stateTexWidth = texWidth;
    let stateX = agentIndex % stateTexWidth;
    let stateY = agentIndex / stateTexWidth;
    
    if (stateY >= texHeight) {
        output.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        output.vColor = vec4<f32>(0.0);
        return output;
    }
    
    // Read agent state
    let state1 = textureLoad(stateTex1, vec2<i32>(stateX, stateY), 0);
    let state2 = textureLoad(stateTex2, vec2<i32>(stateX, stateY), 0);
    
    let x = state1.x;
    let y = state1.y;
    
    // Convert to normalized device coordinates
    let ndc = (vec2<f32>(x, y) / resolution) * 2.0 - 1.0;
    
    output.position = vec4<f32>(ndc, 0.0, 1.0);
    output.vColor = vec4<f32>(state2.rgb, 1.0);
    
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.vColor;
}
