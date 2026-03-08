#version 300 es
precision highp float;

// Vaseline downsample pass - same as bloom, averages pixels into a smaller grid
// with highlight boost for the glow effect

uniform sampler2D inputTex;
uniform vec2 resolution;

out vec4 fragColor;

const float BOOST = 4.0;
const ivec2 DOWNSAMPLE_SIZE = ivec2(64, 64);

void main() {
    ivec2 downCoord = ivec2(gl_FragCoord.xy);
    ivec2 downSize = DOWNSAMPLE_SIZE;
    ivec2 fullSize = ivec2(resolution);
    
    if (downCoord.x >= downSize.x || downCoord.y >= downSize.y) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Calculate kernel size - how many source pixels per downsample cell
    int kernelWidth = max((fullSize.x + downSize.x - 1) / downSize.x, 1);
    int kernelHeight = max((fullSize.y + downSize.y - 1) / downSize.y, 1);
    
    // Origin in full resolution space
    int originX = downCoord.x * kernelWidth;
    int originY = downCoord.y * kernelHeight;
    
    // Accumulate pixel values
    vec3 accum = vec3(0.0);
    float sampleCount = 0.0;
    
    for (int ky = 0; ky < kernelHeight; ky++) {
        int sampleY = originY + ky;
        if (sampleY >= fullSize.y) break;
        
        for (int kx = 0; kx < kernelWidth; kx++) {
            int sampleX = originX + kx;
            if (sampleX >= fullSize.x) break;
            
            vec3 texel = texelFetch(inputTex, ivec2(sampleX, sampleY), 0).rgb;
            vec3 highlight = clamp(texel, 0.0, 1.0);
            accum += highlight;
            sampleCount += 1.0;
        }
    }
    
    if (sampleCount <= 0.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Average and boost for stronger bloom
    vec3 avg = accum / sampleCount;
    vec3 boosted = clamp(avg * BOOST, 0.0, 1.0);
    
    fragColor = vec4(boosted, 1.0);
}
