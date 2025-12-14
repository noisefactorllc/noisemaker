#version 300 es
precision highp float;

uniform vec2 resolution;
uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform float density;

out vec4 vColor;

void main() {
    int agentIndex = gl_VertexID;
    int texWidth = int(resolution.x);
    int texHeight = int(resolution.y);
    
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
    
    // Read agent state
    vec4 state1 = texelFetch(stateTex1, ivec2(stateX, stateY), 0);
    vec4 state2 = texelFetch(stateTex2, ivec2(stateX, stateY), 0);
    
    float x = state1.x;
    float y = state1.y;
    
    // Convert to normalized device coordinates
    vec2 ndc = (vec2(x, y) / resolution) * 2.0 - 1.0;
    
    gl_Position = vec4(ndc, 0.0, 1.0);
    gl_PointSize = 1.0;
    
    // Pass agent color to fragment shader
    vColor = vec4(state2.rgb, 1.0);
}
