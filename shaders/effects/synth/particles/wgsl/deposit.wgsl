struct Uniforms {
    resolution: vec2f,
    density: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var stateTex1: texture_2d<f32>;
@group(0) @binding(2) var stateTex2: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vertexID: u32) -> VertexOutput {
    var out: VertexOutput;
    
    let size = textureDimensions(stateTex1, 0);
    let totalParticles = i32(size.x * size.y);
    let maxParticles = i32(f32(totalParticles) * u.density * 0.01);
    
    if (i32(vertexID) >= maxParticles) {
        out.position = vec4f(2.0, 2.0, 0.0, 1.0);
        out.color = vec4f(0.0);
        return out;
    }
    
    let x = i32(vertexID) % i32(size.x);
    let y = i32(vertexID) / i32(size.x);
    
    let state1 = textureLoad(stateTex1, vec2i(x, y), 0);
    let state2 = textureLoad(stateTex2, vec2i(x, y), 0);
    
    let pos = state1.xy;
    let color = state2.rgb;
    
    let clipPos = (pos / u.resolution) * 2.0 - 1.0;
    
    out.position = vec4f(clipPos, 0.0, 1.0);
    out.color = vec4f(color, 1.0);
    
    return out;
}

@fragment
fn fs_main(@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
}
