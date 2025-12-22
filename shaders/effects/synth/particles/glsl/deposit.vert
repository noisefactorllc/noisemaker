#version 300 es
precision highp float;

uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform vec2 resolution;
uniform float density;

out vec4 vColor;

void main() {
    ivec2 size = textureSize(stateTex1, 0);
    int totalParticles = size.x * size.y;
    int maxParticles = int(float(totalParticles) * density * 0.01);
    
    if (gl_VertexID >= maxParticles) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    int x = gl_VertexID % size.x;
    int y = gl_VertexID / size.x;
    
    vec4 state1 = texelFetch(stateTex1, ivec2(x, y), 0);
    vec4 state2 = texelFetch(stateTex2, ivec2(x, y), 0);
    
    vec2 pos = state1.xy;
    vec3 color = state2.rgb;
    
    // Convert to clip space
    vec2 clipPos = (pos / resolution) * 2.0 - 1.0;
    
    gl_Position = vec4(clipPos, 0.0, 1.0);
    gl_PointSize = 2.0;
    
    vColor = vec4(color, 1.0);
}
