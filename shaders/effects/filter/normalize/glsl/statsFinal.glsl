#version 300 es
precision highp float;
precision highp int;

// Final stats pass: reduce the entire reduce1 texture to a single min/max value
// Input: reduce1 texture (already contains min in .r, max in .g from pyramid reduction)
// Output: 1x1 texture with global min/max

uniform sampler2D inputTex;
out vec4 fragColor;

void main() {
    ivec2 inSize = textureSize(inputTex, 0);
    
    float minVal = 100000.0;
    float maxVal = -100000.0;
    
    // Scan entire reduced texture (should be small after 2x 4:1 reductions)
    for (int y = 0; y < inSize.y; y++) {
        for (int x = 0; x < inSize.x; x++) {
            vec4 color = texelFetch(inputTex, ivec2(x, y), 0);
            
            // Input from reduce pass has min in .r, max in .g
            minVal = min(minVal, color.r);
            maxVal = max(maxVal, color.g);
        }
    }
    
    // Output min in r, max in g for apply pass
    fragColor = vec4(minVal, maxVal, 0.0, 1.0);
}
