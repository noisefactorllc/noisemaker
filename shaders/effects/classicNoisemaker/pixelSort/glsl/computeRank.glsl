#version 300 es
precision highp float;
precision highp int;

// GPGPU Pass 3: Compute rank for each pixel (optimized)
// Input: luminance texture (R = luminance)
// Output: R = rank (normalized), G = luminance, B = original x, A = 1
// Uses sparse sampling for O(1) approximate rank instead of O(n) exact rank

uniform sampler2D lumTex;

out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 size = textureSize(lumTex, 0);
    int x = coord.x;
    int y = coord.y;
    int width = size.x;
    
    float myLum = texelFetch(lumTex, coord, 0).r;
    
    // Use sparse sampling - sample a fixed number of points across the row
    // This gives O(1) approximate rank instead of O(n) exact rank
    const int NUM_SAMPLES = 32;
    int brighterCount = 0;
    
    for (int s = 0; s < NUM_SAMPLES; s++) {
        // Sample evenly across the row
        int sampleX = (s * width) / NUM_SAMPLES;
        if (sampleX == x) continue;
        
        float otherLum = texelFetch(lumTex, ivec2(sampleX, y), 0).r;
        if (otherLum > myLum || (otherLum == myLum && sampleX < x)) {
            brighterCount++;
        }
    }
    
    // Estimate rank based on samples
    float estimatedRank = float(brighterCount) / float(NUM_SAMPLES);
    
    // Output: rank (normalized), luminance, original x (normalized)
    fragColor = vec4(estimatedRank, myLum, float(x) / float(width - 1), 1.0);
}
