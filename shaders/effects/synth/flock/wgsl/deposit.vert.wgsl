// WGSL Deposit Vertex Shader

struct Uniforms {
    resolution: vec2f,
    density: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) vUV: vec2f,
    @location(1) vColor: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let size = textureDimensions(stateTex1, 0);
    let w = i32(size.x);
    let h = i32(size.y);
    let totalBoids = w * h;
    
    // Calculate max active boids based on density (0-100%)
    let maxBoids = i32(f32(totalBoids) * uniforms.density * 0.01);
    
    // Skip if beyond boid count
    if (i32(vertexIndex) >= maxBoids) {
        output.position = vec4f(2.0, 2.0, 0.0, 1.0);
        output.vUV = vec2f(0.0);
        output.vColor = vec4f(0.0);
        return output;
    }
    
    let x = i32(vertexIndex) % w;
    let y = i32(vertexIndex) / w;
    
    let state1 = textureLoad(stateTex1, vec2i(x, y), 0);
    output.vColor = textureLoad(stateTex2, vec2i(x, y), 0);
    
    let pos = state1.xy;
    let clip = pos / uniforms.resolution * 2.0 - 1.0;
    
    output.position = vec4f(clip, 0.0, 1.0);
    output.vUV = pos / uniforms.resolution;
    
    return output;
}
