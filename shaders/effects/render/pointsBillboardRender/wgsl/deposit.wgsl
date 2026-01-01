// Billboard Deposit Shader - Scatter agents as billboard quads

struct Uniforms {
    resolution: vec2<f32>,
    density: f32,
    pointSize: f32,
    sizeVariation: f32,
    rotationVariation: f32,
    seed: f32,
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
    @location(1) spriteUV: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var rgbaTex: texture_2d<f32>;

// Deterministic noise function for per-particle variation
fn hash(n: f32) -> f32 {
    return fract(sin(n + u.seed) * 43758.5453123);
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // Each quad uses 6 vertices (2 triangles)
    let particleID = i32(vertexIndex) / 6;
    let vertexInQuad = i32(vertexIndex) % 6;
    
    // Get state size from xyz texture dimensions
    let texSize = textureDimensions(xyzTex, 0);
    let stateSize = i32(texSize.x);
    let totalAgents = stateSize * stateSize;
    
    // Cull particles beyond texture size
    if (particleID >= totalAgents) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.spriteUV = vec2<f32>(0.0);
        return out;
    }
    
    // Density-based culling
    let cullThreshold = u.density / 100.0;
    let particleRandom = fract(f32(particleID) * 0.618033988749895);
    if (particleRandom > cullThreshold) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.spriteUV = vec2<f32>(0.0);
        return out;
    }
    
    // Calculate UV for this particle
    let x = particleID % stateSize;
    let y = particleID / stateSize;
    
    // Read particle position and color
    let pos = textureLoad(xyzTex, vec2<i32>(x, y), 0);
    let col = textureLoad(rgbaTex, vec2<i32>(x, y), 0);
    
    // Check if particle is alive (pos.w >= 0.5 means alive)
    if (pos.w < 0.5) {
        out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.spriteUV = vec2<f32>(0.0);
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
        
        // Detect if this is a 2D system or 3D attractor
        let is2DSystem = abs(p.z) < 1.0 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
        
        if (is2DSystem) {
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
        
        // Apply X/Y offset after rotation
        p.x = p.x + u.posX;
        p.y = p.y + u.posY;
        
        // Orthographic projection with scale
        // Flip Y for WebGPU coordinate system
        if (is2DSystem) {
            clipPos = vec2<f32>(p.x * 3.5 * u.viewScale, -p.y * 3.5 * u.viewScale);
        } else {
            clipPos = vec2<f32>(p.x / 40.0 * u.viewScale, -p.y / 40.0 * u.viewScale);
        }
    }
    
    // Per-particle size variation (seeded deterministic)
    let sizeNoise = hash(f32(particleID));
    let sizeMultiplier = 1.0 - (u.sizeVariation / 100.0) * (sizeNoise - 0.5);
    let finalSize = u.pointSize * sizeMultiplier;
    
    // Per-particle rotation (seeded deterministic)
    let rotationNoise = hash(f32(particleID) + 1234.5);
    let rotation = (u.rotationVariation / 100.0) * rotationNoise * 6.283185; // 0 to 2π
    
    // Convert pixel size to clip-space units
    let pixelToClip = 2.0 / u.resolution;
    let halfSize = finalSize * 0.5;
    let sizeClip = halfSize * pixelToClip;
    
    // Quad vertex offsets (two triangles: 0-1-2, 2-1-3)
    var offsets: array<vec2<f32>, 6>;
    offsets[0] = vec2<f32>(-1.0, -1.0); // bottom-left
    offsets[1] = vec2<f32>( 1.0, -1.0); // bottom-right
    offsets[2] = vec2<f32>(-1.0,  1.0); // top-left
    offsets[3] = vec2<f32>(-1.0,  1.0); // top-left
    offsets[4] = vec2<f32>( 1.0, -1.0); // bottom-right
    offsets[5] = vec2<f32>( 1.0,  1.0); // top-right
    
    let offset = offsets[vertexInQuad];
    
    // Apply rotation to offset
    let cosR = cos(rotation);
    let sinR = sin(rotation);
    let rotatedOffset = vec2<f32>(
        offset.x * cosR - offset.y * sinR,
        offset.x * sinR + offset.y * cosR
    );
    
    // Scale offset and add to center position
    let finalPos = clipPos + rotatedOffset * sizeClip;
    
    out.position = vec4<f32>(finalPos, 0.0, 1.0);
    out.color = vec4<f32>(col.rgb, col.a);
    
    // Sprite UV coordinates (0-1 range)
    out.spriteUV = offset * 0.5 + 0.5;
    
    return out;
}

@group(0) @binding(3) var spriteTex: texture_2d<f32>;
@group(0) @binding(4) var spriteSampler: sampler;

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample sprite texture
    let spriteColor = textureSample(spriteTex, spriteSampler, in.spriteUV);
    
    // Multiply sprite by particle color (tint the sprite)
    // Use sprite alpha for transparency
    return vec4<f32>(spriteColor.rgb * in.color.rgb, spriteColor.a * in.color.a);
}
