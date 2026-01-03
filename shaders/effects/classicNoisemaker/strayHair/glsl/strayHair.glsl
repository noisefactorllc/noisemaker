#version 300 es

precision highp float;
precision highp int;

// Stray Hair effect - generates sparse, long hair-like strands over the image.
// Self-contained single-pass implementation.

uniform sampler2D inputTex;
uniform float time;
uniform int seed;

in vec2 v_texCoord;
out vec4 fragColor;

// Hash functions
float hash21(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

float hash11(float p) {
    return fract(sin(p * 127.1) * 43758.5453123);
}

// Value noise
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Generate hair strand pattern
float hairStrand(vec2 uv, float hairSeed, float hairLength, float hairThickness) {
    // Hair parameters seeded by hairSeed
    float startX = hash11(hairSeed * 17.3);
    float startY = hash11(hairSeed * 31.7);
    float angle = hash11(hairSeed * 43.1) * 6.28318;
    float kink = (hash11(hairSeed * 59.3) - 0.5) * 4.0;
    
    // Starting point
    vec2 start = vec2(startX, startY);
    
    // Distance along hair axis
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 toPoint = uv - start;
    float along = dot(toPoint, dir);
    
    // Only draw if we're within the hair length
    if (along < 0.0 || along > hairLength) return 0.0;
    
    // Perpendicular distance with kink
    vec2 perp = vec2(-dir.y, dir.x);
    float perpDist = abs(dot(toPoint, perp) - sin(along * kink * 20.0) * 0.01);
    
    // Hair thickness falloff
    float thickness = hairThickness * (1.0 - along / hairLength);
    
    // Smooth edge
    return smoothstep(thickness, thickness * 0.3, perpDist);
}

void main() {
    vec4 baseColor = texture(inputTex, v_texCoord);
    vec2 dims = vec2(textureSize(inputTex, 0));
    float aspect = dims.x / dims.y;
    vec2 uv = v_texCoord;
    uv.x *= aspect;
    
    // Generate multiple hair strands
    float hairMask = 0.0;
    float brightness = 0.0;
    
    // Use seed to vary hair generation
    // Add seed directly to hash inputs to ensure different outputs
    float seedOffset = float(seed) * 7.919;  // Prime multiplier for better distribution
    float baseSeed = seedOffset + floor(time * 0.1) * 13.37;
    
    // Number of hairs based on image size
    int numHairs = 15;
    
    for (int i = 0; i < numHairs; i++) {
        float hairSeed = baseSeed + float(i) * 127.3;
        float hairLength = 0.3 + hash11(hairSeed * 73.7) * 0.4;
        float hairThickness = 0.001 + hash11(hairSeed * 91.3) * 0.002;
        
        float strand = hairStrand(uv, hairSeed, hairLength, hairThickness);
        hairMask = max(hairMask, strand);
        
        // Brightness variation per hair
        float hairBrightness = 0.1 + hash11(hairSeed * 113.7) * 0.4;
        brightness = max(brightness, strand * hairBrightness);
    }
    
    // Blend hair over base image
    float blendFactor = clamp(hairMask * 0.666, 0.0, 1.0);
    vec3 hairColor = vec3(brightness * 0.333);
    
    vec3 baseComponent = baseColor.rgb * (1.0 - blendFactor);
    vec3 hairComponent = hairColor * blendFactor;
    vec3 result = clamp(baseComponent + hairComponent, 0.0, 1.0);
    
    fragColor = vec4(result, baseColor.a);
}
