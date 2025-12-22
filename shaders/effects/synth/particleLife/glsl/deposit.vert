#version 300 es
precision highp float;

// Deposit Vertex Shader - Position particles as points

uniform vec2 resolution;
uniform sampler2D stateTex1;  // [posX, posY, velX, velY]
uniform sampler2D stateTex3;  // [r, g, b, a] - color
uniform float density;

out vec4 vColor;

void main() {
    ivec2 size = textureSize(stateTex1, 0);
    int w = size.x;
    int h = size.y;
    int totalParticles = w * h;
    
    // Calculate max active particles based on density
    int maxParticles = int(float(totalParticles) * density * 0.01);
    
    // Skip if beyond particle count
    if (gl_VertexID >= maxParticles) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);  // Off-screen
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }
    
    int x = gl_VertexID % w;
    int y = gl_VertexID / w;
    
    vec4 state1 = texelFetch(stateTex1, ivec2(x, y), 0);
    vColor = texelFetch(stateTex3, ivec2(x, y), 0);
    
    vec2 pos = state1.xy;
    vec2 vel = state1.zw;
    
    // Convert to clip space
    vec2 clip = pos / resolution * 2.0 - 1.0;
    
    gl_Position = vec4(clip, 0.0, 1.0);
    
    // Point size based on velocity (faster = larger trail)
    float speed = length(vel);
    gl_PointSize = 1.0 + speed * 0.3;
}
