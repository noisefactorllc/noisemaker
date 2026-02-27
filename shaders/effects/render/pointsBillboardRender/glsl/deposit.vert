#version 300 es
precision highp float;

// Billboard Deposit Vertex Shader - Scatter agents as billboard quads

uniform sampler2D xyzTex;
uniform sampler2D rgbaTex;
uniform vec2 resolution;
uniform float density;
uniform float pointSize;
uniform float sizeVariation;
uniform float rotationVar;
uniform float seed;

// 3D viewport uniforms
uniform int viewMode;
uniform float rotateX;
uniform float rotateY;
uniform float rotateZ;
uniform float viewScale;
uniform float posX;
uniform float posY;

out vec4 vColor;
out vec2 vSpriteUV;

// Deterministic noise function for per-particle variation
float hash(float n) {
    return fract(sin(n + seed) * 43758.5453123);
}

void main() {
    // Each quad uses 6 vertices (2 triangles)
    int particleID = gl_VertexID / 6;
    int vertexInQuad = gl_VertexID % 6;
    
    // Get state size from xyz texture dimensions
    ivec2 texSize = textureSize(xyzTex, 0);
    int stateSize = texSize.x;
    int totalAgents = stateSize * stateSize;
    
    // Cull particles beyond texture size
    if (particleID >= totalAgents) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        vColor = vec4(0.0);
        vSpriteUV = vec2(0.0);
        return;
    }
    
    // Density-based culling
    float cullThreshold = density / 100.0;
    float particleRandom = fract(float(particleID) * 0.618033988749895);
    if (particleRandom > cullThreshold) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        vColor = vec4(0.0);
        vSpriteUV = vec2(0.0);
        return;
    }
    
    // Calculate UV for this particle
    int x = particleID % stateSize;
    int y = particleID / stateSize;
    
    // Read particle position and color
    vec4 pos = texelFetch(xyzTex, ivec2(x, y), 0);
    vec4 col = texelFetch(rgbaTex, ivec2(x, y), 0);
    
    // Check if particle is alive (pos.w >= 0.5 means alive)
    if (pos.w < 0.5) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        vColor = vec4(0.0);
        vSpriteUV = vec2(0.0);
        return;
    }
    
    // Calculate clip-space center position (same as pointsRender)
    vec2 clipPos;
    
    if (viewMode == 0) {
        // 2D mode: positions are normalized 0..1
        clipPos = pos.xy * 2.0 - 1.0;
    } else {
        // 3D mode: apply rotation and orthographic projection
        vec3 p = pos.xyz;
        
        // Detect if this is a 2D system (coords in 0-1) or 3D attractor (coords ±40)
        bool is2DSystem = abs(p.z) < 1.0 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
        
        if (is2DSystem) {
            p.xy = p.xy - 0.5;
            p.z = 0.0;
        }
        
        // Apply rotation around X axis
        float cosX = cos(rotateX);
        float sinX = sin(rotateX);
        p = vec3(p.x, p.y * cosX - p.z * sinX, p.y * sinX + p.z * cosX);
        
        // Apply rotation around Y axis
        float cosY = cos(rotateY);
        float sinY = sin(rotateY);
        p = vec3(p.x * cosY + p.z * sinY, p.y, -p.x * sinY + p.z * cosY);
        
        // Apply rotation around Z axis
        float cosZ = cos(rotateZ);
        float sinZ = sin(rotateZ);
        p = vec3(p.x * cosZ - p.y * sinZ, p.x * sinZ + p.y * cosZ, p.z);
        
        // Apply X/Y offset after rotation
        p.x += posX;
        p.y += posY;
        
        // Orthographic projection with scale
        if (is2DSystem) {
            clipPos = p.xy * 3.5 * viewScale;
        } else {
            clipPos = p.xy / 40.0 * viewScale;
        }
    }
    
    // Per-particle size variation (seeded deterministic)
    float sizeNoise = hash(float(particleID));
    float sizeMultiplier = 1.0 - (sizeVariation / 100.0) * (sizeNoise - 0.5);
    float finalSize = pointSize * sizeMultiplier;
    
    // Per-particle rotation (seeded deterministic)
    float rotationNoise = hash(float(particleID) + 1234.5);
    float rotation = (rotationVar / 100.0) * rotationNoise * 6.283185; // 0 to 2π
    
    // Convert pixel size to clip-space units
    vec2 pixelToClip = 2.0 / resolution;
    float halfSize = finalSize * 0.5;
    vec2 sizeClip = halfSize * pixelToClip;
    
    // Quad vertex offsets (two triangles: 0-1-2, 2-1-3)
    // Winding order for proper face culling
    vec2 offsets[6];
    offsets[0] = vec2(-1.0, -1.0); // bottom-left
    offsets[1] = vec2( 1.0, -1.0); // bottom-right
    offsets[2] = vec2(-1.0,  1.0); // top-left
    offsets[3] = vec2(-1.0,  1.0); // top-left
    offsets[4] = vec2( 1.0, -1.0); // bottom-right
    offsets[5] = vec2( 1.0,  1.0); // top-right
    
    vec2 offset = offsets[vertexInQuad];
    
    // Apply rotation to offset
    float cosR = cos(rotation);
    float sinR = sin(rotation);
    vec2 rotatedOffset = vec2(
        offset.x * cosR - offset.y * sinR,
        offset.x * sinR + offset.y * cosR
    );
    
    // Scale offset and add to center position
    vec2 finalPos = clipPos + rotatedOffset * sizeClip;
    
    gl_Position = vec4(finalPos, 0.0, 1.0);
    vColor = vec4(col.rgb, col.a);
    
    // Sprite UV coordinates (0-1 range)
    vSpriteUV = offset * 0.5 + 0.5;
}
