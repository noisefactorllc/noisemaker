// Deposit Shader - Scatter agents to trail texture

struct Uniforms {
    resolution: vec2<f32>,
    density: f32,
    viewMode: i32,
    rotateX: f32,
    rotateY: f32,
    rotateZ: f32,
    viewScale: f32,
    posX: f32,
    posY: f32,
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
    
    // Density-based culling
    let cullThreshold = u.density / 100.0;
    let particleRandom = fract(f32(vertexIndex) * 0.618033988749895);
    if (particleRandom > cullThreshold) {
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
    
    var clipPos: vec2<f32>;
    
    if (u.viewMode == 0) {
        // 2D mode: positions are normalized 0..1
        // WebGPU Y is flipped vs WebGL2 - flip Y to match
        clipPos = vec2<f32>(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0);
    } else {
        // 3D mode: apply rotation and orthographic projection
        var p = pos.xyz;
        
        // Detect if this is a 2D system (coords in 0-1) or 3D attractor (coords ±40)
        // 2D systems have Z near 0 and XY in 0-1 range
        let is2DSystem = abs(p.z) < 1.0 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
        
        if (is2DSystem) {
            // Center 2D coords around origin: 0-1 -> -0.5 to 0.5
            p = vec3<f32>(p.x - 0.5, p.y - 0.5, 0.0);
        }
        
        // Apply rotation around X axis
        let cosX = cos(u.rotateX);
        let sinX = sin(u.rotateX);
        p = vec3<f32>(p.x, p.y * cosX - p.z * sinX, p.y * sinX + p.z * cosX);
        
        // Apply rotation around Y axis
        let cosY = cos(u.rotateY);
        let sinY = sin(u.rotateY);
        p = vec3<f32>(p.x * cosY + p.z * sinY, p.y, -p.x * sinY + p.z * cosY);
        
        // Apply rotation around Z axis
        let cosZ = cos(u.rotateZ);
        let sinZ = sin(u.rotateZ);
        p = vec3<f32>(p.x * cosZ - p.y * sinZ, p.x * sinZ + p.y * cosZ, p.z);
        
        // Apply X/Y offset after rotation (pan in screen space)
        p.x = p.x + u.posX;
        p.y = p.y + u.posY;
        
        // Orthographic projection with scale
        // Flip Y for WebGPU coordinate system
        if (is2DSystem) {
            // 2D systems: coords are now ±0.5, scale to fill viewport
            // Use 3.5x multiplier for close-up view that's nice to pan around
            clipPos = vec2<f32>(p.x * 3.5 * u.viewScale, -p.y * 3.5 * u.viewScale);
        } else {
            // 3D attractors: coords range roughly ±40, normalize then scale
            clipPos = vec2<f32>(p.x / 40.0 * u.viewScale, -p.y / 40.0 * u.viewScale);
        }
    }
    
    out.position = vec4<f32>(clipPos, 0.0, 1.0);
    out.color = vec4<f32>(col.rgb, col.a);
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
