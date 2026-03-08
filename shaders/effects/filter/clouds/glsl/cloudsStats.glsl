#version 300 es
precision highp float;
precision highp int;

// Final stats pass: reduce all min/max values to a single global min/max
// Input: reduceTex with .r = local min, .g = local max
// Output: 1x1 texture with .r = global min, .g = global max

uniform sampler2D reduceTex;
out vec4 fragColor;

void main() {
    ivec2 inSize = textureSize(reduceTex, 0);
    
    float globalMin = 100000.0;
    float globalMax = -100000.0;
    
    // Read all pixels from the reduced texture
    for (int y = 0; y < inSize.y; y++) {
        for (int x = 0; x < inSize.x; x++) {
            vec4 stats = texelFetch(reduceTex, ivec2(x, y), 0);
            globalMin = min(globalMin, stats.r);
            globalMax = max(globalMax, stats.g);
        }
    }
    
    // Store global min/max
    fragColor = vec4(globalMin, globalMax, 0.0, 1.0);
}
