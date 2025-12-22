#version 300 es
precision highp float;

uniform vec2 resolution;
uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform float rotateX;
uniform float rotateY;
uniform float rotateZ;
uniform float scale;
uniform float density;

out vec4 fragColor;

void main() {
    // Get particle index from vertex ID
    int particleIndex = gl_VertexID;
    int texWidth = textureSize(stateTex1, 0).x;
    int texHeight = textureSize(stateTex1, 0).y;
    int totalAgents = texWidth * texHeight;
    int maxParticles = int(float(totalAgents) * density * 0.01);
    
    // Skip inactive particles based on density
    if (particleIndex >= maxParticles) {
        gl_Position = vec4(-10.0, -10.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }
    
    ivec2 coord = ivec2(particleIndex % texWidth, particleIndex / texWidth);
    
    vec4 state1 = texelFetch(stateTex1, coord, 0);
    vec4 state2 = texelFetch(stateTex2, coord, 0);
    
    // Skip uninitialized particles
    if (state1.w < 0.5) {
        gl_Position = vec4(-10.0, -10.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        return;
    }
    
    vec3 pos = state1.xyz;
    
    // Apply rotation around X axis
    float cosX = cos(rotateX);
    float sinX = sin(rotateX);
    pos = vec3(pos.x, pos.y * cosX - pos.z * sinX, pos.y * sinX + pos.z * cosX);
    
    // Apply rotation around Y axis
    float cosY = cos(rotateY);
    float sinY = sin(rotateY);
    pos = vec3(pos.x * cosY + pos.z * sinY, pos.y, -pos.x * sinY + pos.z * cosY);
    
    // Apply rotation around Z axis
    float cosZ = cos(rotateZ);
    float sinZ = sin(rotateZ);
    pos = vec3(pos.x * cosZ - pos.y * sinZ, pos.x * sinZ + pos.y * cosZ, pos.z);
    
    // Project to 2D (simple orthographic, centered)
    // Normalize to roughly -1 to 1 range, then apply scale
    // Lorenz ranges roughly ±40, so divide by 40 first
    vec2 screenPos = pos.xy / 40.0 * scale;
    
    // Convert to clip space
    gl_Position = vec4(screenPos, 0.0, 1.0);
    gl_PointSize = 1.0;
    
    // Pass color to fragment shader via varying
    fragColor = vec4(state2.rgb, 1.0);
}
