#version 300 es
precision highp float;
precision highp int;

// Reduce pass: sample 16x16 block from downsample texture, compute local min/max of control (blue channel)
// Output: .r = min, .g = max

uniform sampler2D downsampleTex;
out vec4 fragColor;

void main() {
    ivec2 outCoord = ivec2(gl_FragCoord.xy);
    ivec2 inSize = textureSize(downsampleTex, 0);
    
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
            
            vec4 color = texelFetch(downsampleTex, sampleCoord, 0);
            
            // Control is in blue channel
            float control = color.b;
            
            minVal = min(minVal, control);
            maxVal = max(maxVal, control);
        }
    }
    
    // Store min in r, max in g
    fragColor = vec4(minVal, maxVal, 0.0, 1.0);
}
