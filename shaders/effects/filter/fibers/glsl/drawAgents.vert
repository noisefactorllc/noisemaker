#version 300 es
precision highp float;

uniform sampler2D agentTex;
uniform vec2 resolution;

void main() {
    int id = gl_VertexID;
    ivec2 texSize = textureSize(agentTex, 0);
    int width = texSize.x;
    int height = texSize.y;

    int x = id % width;
    int y = id / width;

    if (y >= height) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        return;
    }

    vec4 agent = texelFetch(agentTex, ivec2(x, y), 0);
    vec2 pos = agent.xy;
    float life = agent.w;

    // Only draw alive agents
    if (life <= 0.0) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        return;
    }

    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}
