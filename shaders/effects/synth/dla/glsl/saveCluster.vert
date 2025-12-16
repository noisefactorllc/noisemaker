#version 300 es
precision highp float;
uniform sampler2D agentTex;
uniform sampler2D colorTex;
out float v_weight;
out vec3 v_color;

ivec2 decodeIndex(int index, ivec2 dims) {
    int x = index % dims.x;
    int y = index / dims.x;
    return ivec2(x, y);
}

void main() {
    ivec2 dims = textureSize(agentTex, 0);
    ivec2 coord = decodeIndex(gl_VertexID, dims);
    vec2 uv = (vec2(coord) + 0.5) / vec2(dims);
    vec4 state = texture(agentTex, uv);
    vec4 color = texture(colorTex, uv);
    float weight = clamp(state.w, 0.0, 1.0);
    v_weight = weight;
    v_color = color.rgb;
    if (weight < 0.5) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        return;
    }

    vec2 clip = state.xy * 2.0 - 1.0;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 1.0;
}
