#version 300 es
precision highp float;

// State texture containing particle positions
uniform sampler2D xyzTex;
uniform vec2 resolution;

void main() {
    // Get particle index from vertex ID
    ivec2 stateSize = textureSize(xyzTex, 0);
    int x = gl_VertexID % stateSize.x;
    int y = gl_VertexID / stateSize.x;

    // Read particle state
    vec4 xyz = texelFetch(xyzTex, ivec2(x, y), 0);
    float alive = xyz.w;

    // Dead particles go offscreen
    if (alive < 0.5) {
        gl_Position = vec4(-999.0, -999.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        return;
    }

    // Convert normalized [0,1] position to clip space [-1,1]
    vec2 pos = xyz.xy * 2.0 - 1.0;

    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = 2.0;  // Slightly larger deposit for more presence
}
