#version 300 es
precision highp float;

// Deposit Vertex Shader - Scatter agents to trail texture

uniform sampler2D xyzTex;
uniform sampler2D rgbaTex;
uniform vec2 resolution;
uniform float density;

out vec4 vColor;

void main() {
    // Get state size from xyz texture dimensions (inherited from pointsEmitter)
    ivec2 texSize = textureSize(xyzTex, 0);
    int stateSize = texSize.x;
    int totalAgents = stateSize * stateSize;
    
    // Cull vertices beyond texture size
    if (gl_VertexID >= totalAgents) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    // Density-based culling
    float cullThreshold = density / 100.0;
    float particleRandom = fract(float(gl_VertexID) * 0.618033988749895);
    if (particleRandom > cullThreshold) {
        // Cull this particle by placing it off-screen
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    // Calculate UV for this agent
    int x = gl_VertexID % stateSize;
    int y = gl_VertexID / stateSize;
    
    // Read agent position and color
    vec4 pos = texelFetch(xyzTex, ivec2(x, y), 0);
    vec4 col = texelFetch(rgbaTex, ivec2(x, y), 0);
    
    // Check if agent is alive (pos.w >= 0.5 means alive)
    if (pos.w < 0.5) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    // Convert position (0..1) to clip space (-1..1)
    vec2 clipPos = pos.xy * 2.0 - 1.0;
    
    gl_Position = vec4(clipPos, 0.0, 1.0);
    gl_PointSize = 1.0;
    vColor = vec4(col.rgb, col.a);
}
