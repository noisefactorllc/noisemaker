#version 300 es
precision highp float;

// DLA - Deposit stuck agents to anchor grid (vertex shader)
// Only deposits agents that just stuck (vel.y == 1.0)

uniform sampler2D xyzTex;
uniform sampler2D velTex;
uniform sampler2D rgbaTex;

out float v_weight;
out vec3 v_color;

ivec2 decodeIndex(int index, ivec2 dims) {
    int x = index % dims.x;
    int y = index / dims.x;
    return ivec2(x, y);
}

void main() {
    ivec2 dims = textureSize(xyzTex, 0);
    int totalAgents = dims.x * dims.y;
    
    // Skip if vertex index exceeds agent count
    if (gl_VertexID >= totalAgents) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        v_weight = 0.0;
        v_color = vec3(0.0);
        return;
    }
    
    ivec2 coord = decodeIndex(gl_VertexID, dims);
    
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    
    // vel.y == 1.0 means this agent just stuck
    float justStuck = vel.y;
    
    v_weight = justStuck;
    v_color = rgba.rgb;
    
    // Only render if just stuck
    if (justStuck < 0.5) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        return;
    }
    
    // Position from xyz (normalized [0,1])
    vec2 clip = xyz.xy * 2.0 - 1.0;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 1.0;
}
