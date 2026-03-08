#version 300 es
precision highp float;
precision highp int;

// Initial reduce pass: sample 16x16 block from original image, compute local min/max
// Output: .r = min, .g = max
// This reduces the texture by 16x in each dimension

uniform sampler2D inputTex;
out vec4 fragColor;

void main() {
    ivec2 outCoord = ivec2(gl_FragCoord.xy);
    ivec2 inSize = textureSize(inputTex, 0);
    
    // Each output pixel covers a 16x16 area of input
    ivec2 baseCoord = outCoord * 16;
    
    float minVal = 100000.0;
    float maxVal = -100000.0;
    
    // Sample 16x16 block
    for (int dy = 0; dy < 16; dy++) {
        for (int dx = 0; dx < 16; dx++) {
            ivec2 sampleCoord = baseCoord + ivec2(dx, dy);
            
            // Skip if out of bounds
            if (sampleCoord.x >= inSize.x || sampleCoord.y >= inSize.y) continue;
            
            vec4 color = texelFetch(inputTex, sampleCoord, 0);
            
            // Compute RGB min/max for the original image
            float pixelMin = min(min(color.r, color.g), color.b);
            float pixelMax = max(max(color.r, color.g), color.b);
            
            minVal = min(minVal, pixelMin);
            maxVal = max(maxVal, pixelMax);
        }
    }
    
    // Store min in r, max in g
    fragColor = vec4(minVal, maxVal, 0.0, 1.0);
}