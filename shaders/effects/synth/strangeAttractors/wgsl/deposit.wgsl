struct Uniforms {
    resolution: vec2f,
    rotateX: f32,
    rotateY: f32,
    rotateZ: f32,
    scale: f32,
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
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let texSize = textureDimensions(stateTex1, 0);
    let texWidth = i32(texSize.x);
    let texHeight = i32(texSize.y);
    let totalAgents = texWidth * texHeight;
    let maxParticles = i32(f32(totalAgents) * u.density * 0.01);
    
    let particleIndex = i32(vertexIndex);
    
    // Skip inactive particles based on density
    if (particleIndex >= maxParticles) {
        output.position = vec4f(-10.0, -10.0, 0.0, 1.0);
        output.color = vec4f(0.0);
        return output;
    }
    
    let coord = vec2i(particleIndex % texWidth, particleIndex / texWidth);
    
    let state1 = textureLoad(stateTex1, coord, 0);
    let state2 = textureLoad(stateTex2, coord, 0);
    
    // Skip uninitialized particles
    if (state1.w < 0.5) {
        output.position = vec4f(-10.0, -10.0, 0.0, 1.0);
        output.color = vec4f(0.0);
        return output;
    }
    
    var pos = state1.xyz;
    
    // Apply rotation around X axis
    let cosX = cos(u.rotateX);
    let sinX = sin(u.rotateX);
    pos = vec3f(pos.x, pos.y * cosX - pos.z * sinX, pos.y * sinX + pos.z * cosX);
    
    // Apply rotation around Y axis
    let cosY = cos(u.rotateY);
    let sinY = sin(u.rotateY);
    pos = vec3f(pos.x * cosY + pos.z * sinY, pos.y, -pos.x * sinY + pos.z * cosY);
    
    // Apply rotation around Z axis
    let cosZ = cos(u.rotateZ);
    let sinZ = sin(u.rotateZ);
    pos = vec3f(pos.x * cosZ - pos.y * sinZ, pos.x * sinZ + pos.y * cosZ, pos.z);
    
    // Project to 2D (simple orthographic, centered)
    // Normalize to roughly -1 to 1 range, then apply scale
    // Lorenz ranges roughly ±40, so divide by 40 first
    let screenPos = pos.xy / 40.0 * u.scale;
    
    output.position = vec4f(screenPos, 0.0, 1.0);
    output.color = vec4f(state2.rgb, 1.0);
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
    return input.color;
}
