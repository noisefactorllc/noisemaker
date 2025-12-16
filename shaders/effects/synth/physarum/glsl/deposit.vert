#version 300 es
precision highp float;
uniform sampler2D stateTex;
uniform sampler2D colorTex;
uniform vec2 resolution;
uniform float density;
out vec2 vUV;
out vec4 vColor;

void main() {
    ivec2 size = textureSize(stateTex, 0);
    int w = size.x;
    int h = size.y;
    int totalAgents = w * h;
    
    // Calculate max active agents based on density (0-100%)
    int maxAgents = int(float(totalAgents) * density * 0.01);
    
    // Skip if beyond agent count
    if (gl_VertexID >= maxAgents) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0); // Off-screen
        gl_PointSize = 0.0;
        vUV = vec2(0.0);
        return;
    }
    
    int x = gl_VertexID % w;
    int y = gl_VertexID / w;

    // Use texelFetch for exact texel (no interpolation for agent state)
    vec4 agent = texelFetch(stateTex, ivec2(x, y), 0);
    vColor = texelFetch(colorTex, ivec2(x, y), 0);
    vec2 clip = agent.xy / resolution * 2.0 - 1.0;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 1.0;
    vUV = agent.xy / resolution;
}
