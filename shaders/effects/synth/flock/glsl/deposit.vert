#version 300 es
precision highp float;

uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform vec2 resolution;
uniform float density;

out vec2 vUV;
out vec4 vColor;

void main() {
    ivec2 size = textureSize(stateTex1, 0);
    int w = size.x;
    int h = size.y;
    int totalBoids = w * h;
    
    // Calculate max active boids based on density (0-100%)
    int maxBoids = int(float(totalBoids) * density * 0.01);
    
    // Skip if beyond boid count
    if (gl_VertexID >= maxBoids) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0); // Off-screen
        gl_PointSize = 0.0;
        vUV = vec2(0.0);
        vColor = vec4(0.0);
        return;
    }
    
    int x = gl_VertexID % w;
    int y = gl_VertexID / w;

    // Use texelFetch for exact texel (no interpolation for boid state)
    vec4 state1 = texelFetch(stateTex1, ivec2(x, y), 0);
    vColor = texelFetch(stateTex2, ivec2(x, y), 0);
    
    vec2 pos = state1.xy;
    vec2 clip = pos / resolution * 2.0 - 1.0;
    
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = 2.0;  // Slightly larger points for visibility
    vUV = pos / resolution;
}
