#version 300 es
precision highp float;
// Flow3D deposit vertex shader - positions agents in 3D volume atlas
// Reads 3D agent positions and converts to 2D atlas coordinates for deposit

uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform float density;
uniform int volumeSize;

out vec4 vColor;

void main() {
    int agentIndex = gl_VertexID;
    // Use actual state texture size, not canvas resolution
    ivec2 stateTexSize = textureSize(stateTex1, 0);
    int texWidth = stateTexSize.x;
    int texHeight = stateTexSize.y;
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    // Calculate max agents based on density
    int maxDim = max(texWidth, texHeight);
    int maxAgents = int(float(maxDim) * density * 0.2);
    
    // Skip if beyond agent count
    if (agentIndex >= maxAgents) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0); // Off-screen
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    // Map agent index to state texture coordinate
    int stateTexWidth = texWidth;
    int stateX = agentIndex % stateTexWidth;
    int stateY = agentIndex / stateTexWidth;
    
    if (stateY >= texHeight) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    // Read agent state (3D position in state1.xyz)
    vec4 state1 = texelFetch(stateTex1, ivec2(stateX, stateY), 0);
    vec4 state2 = texelFetch(stateTex2, ivec2(stateX, stateY), 0);
    
    float x = state1.x;  // [0, volSize)
    float y = state1.y;  // [0, volSize)
    float z = state1.z;  // [0, volSize)
    
    // Convert 3D position to 2D atlas position
    // Atlas layout: width = volSize, height = volSize * volSize
    // y_atlas = y_voxel + z_voxel * volSize
    float atlasX = x;
    float atlasY = y + floor(z) * volSizeF;
    
    // Convert to normalized device coordinates
    // Atlas dimensions: volSize x (volSize * volSize)
    float atlasWidth = volSizeF;
    float atlasHeight = volSizeF * volSizeF;
    
    vec2 ndc = vec2(
        (atlasX / atlasWidth) * 2.0 - 1.0,
        (atlasY / atlasHeight) * 2.0 - 1.0
    );
    
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = 1.0;
    
    // Pass agent color to fragment shader
    vColor = vec4(state2.rgb, 1.0);
}
