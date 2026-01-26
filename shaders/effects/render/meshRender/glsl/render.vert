#version 300 es
precision highp float;

// Mesh Render Vertex Shader
// Reads vertex data from mesh textures and transforms to clip space

uniform sampler2D meshPositions;
uniform sampler2D meshNormals;
uniform vec2 resolution;
uniform float aspect;

// Mesh model transform uniforms
uniform float meshScale;
uniform float meshOffsetX;
uniform float meshOffsetY;
uniform float meshOffsetZ;

// View/camera uniforms
uniform float rotateX;
uniform float rotateY;
uniform float rotateZ;
uniform float viewScale;
uniform float posX;
uniform float posY;

// Output to fragment shader
out vec3 vNormal;
out vec2 vUV;
out vec3 vPosition;

// Rotation matrices
mat3 rotationX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
        1.0, 0.0, 0.0,
        0.0, c, -s,
        0.0, s, c
    );
}

mat3 rotationY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
        c, 0.0, s,
        0.0, 1.0, 0.0,
        -s, 0.0, c
    );
}

mat3 rotationZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
        c, -s, 0.0,
        s, c, 0.0,
        0.0, 0.0, 1.0
    );
}

void main() {
    // Get texture dimensions to compute texel coordinates
    ivec2 texSize = textureSize(meshPositions, 0);
    int texWidth = texSize.x;
    
    // Compute texel coordinate from vertex ID
    int x = gl_VertexID % texWidth;
    int y = gl_VertexID / texWidth;
    
    // Read vertex data from textures
    vec4 posData = texelFetch(meshPositions, ivec2(x, y), 0);
    vec4 normalData = texelFetch(meshNormals, ivec2(x, y), 0);
    
    vec3 position = posData.xyz;
    vec3 normal = normalData.xyz;
    
    // Apply mesh model transforms (scale then offset)
    position = position * meshScale;
    position.x += meshOffsetX;
    position.y += meshOffsetY;
    position.z += meshOffsetZ;
    
    // Build rotation matrix
    mat3 rotation = rotationZ(rotateZ) * rotationY(rotateY) * rotationX(rotateX);
    
    // Transform position and normal
    vec3 rotatedPos = rotation * position;
    vec3 rotatedNormal = rotation * normal;
    
    // Apply camera translation
    rotatedPos.x += posX;
    rotatedPos.y += posY;
    
    // Simple orthographic projection with scale
    vec2 clipPos = rotatedPos.xy * viewScale;
    
    // Adjust for aspect ratio
    clipPos.x /= aspect;
    
    // Orthographic depth: map Z to NDC range [0, 1] for depth buffer
    // Assuming mesh is roughly centered, use a reasonable depth range
    // nearZ = -10, farZ = 10 gives good precision for typical meshes
    float nearZ = -10.0;
    float farZ = 10.0;
    float ndcZ = (rotatedPos.z - nearZ) / (farZ - nearZ);  // Maps to [0, 1]
    
    // Output
    gl_Position = vec4(clipPos, ndcZ, 1.0);
    vNormal = rotatedNormal;
    vUV = vec2(float(x) / float(texWidth), float(y) / float(texSize.y));
    vPosition = rotatedPos;
}
