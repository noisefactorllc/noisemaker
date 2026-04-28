/*
 * Bloom N-tap gather pass
 * Samples bright texture with configurable radially symmetric kernel
 * Kernel uses concentric rings with Gaussian-ish falloff
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float radius;
uniform float renderScale;
uniform int taps;

out vec4 fragColor;

// Maximum number of taps supported
const int MAX_TAPS = 64;

// Golden angle for Poisson-like disk distribution
const float GOLDEN_ANGLE = 2.39996323;
const float PI = 3.14159265359;

void main() {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 uv = gl_FragCoord.xy / texSize;
    vec2 texelSize = 1.0 / texSize;
    
    // Bloom radius in UV space, scaled for export resolution
    vec2 radiusUV = radius * renderScale * texelSize;

    // Clamp taps to valid range
    int tapCount = clamp(taps, 1, MAX_TAPS);
    
    vec3 bloomAccum = vec3(0.0);
    float weightSum = 0.0;
    
    // Generate N-tap kernel using golden angle spiral (Poisson-ish distribution)
    // with Gaussian-like radial falloff for weights
    for (int i = 0; i < MAX_TAPS; i++) {
        if (i >= tapCount) break;

        // Compute tap offset using golden angle spiral
        // r goes from 0 to 1 as sqrt(i/N) for uniform area distribution
        float t = float(i) / float(tapCount);
        float r = sqrt(t);
        float theta = float(i) * GOLDEN_ANGLE;
        
        vec2 offset = vec2(cos(theta), sin(theta)) * r;
        
        // Gaussian-ish weight based on distance from center
        // sigma = 0.4 gives good falloff
        float sigma = 0.4;
        float weight = exp(-0.5 * (r * r) / (sigma * sigma));
        
        // Sample with clamped UV (edge handling)
        vec2 sampleUV = clamp(uv + offset * radiusUV, vec2(0.0), vec2(1.0));
        vec3 sampleColor = texture(inputTex, sampleUV).rgb;
        
        bloomAccum += sampleColor * weight;
        weightSum += weight;
    }
    
    // Normalize for energy conservation
    if (weightSum > 0.0) {
        bloomAccum /= weightSum;
    }
    
    fragColor = vec4(bloomAccum, 1.0);
}
