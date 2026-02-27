#version 300 es

precision highp float;
precision highp int;

// Value Refract: generates noise-driven refraction distortion

uniform sampler2D inputTex;
uniform float time;
uniform float displacement;
uniform float freq;

in vec2 v_texCoord;
out vec4 fragColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

// Simple noise function
float hash21(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

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

// Fractal noise
float fbm(vec2 p, float t) {
    float value = 0.0;
    float amplitude = 0.5;
    float freq = 1.0;
    
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p * freq + t * 0.1);
        amplitude *= 0.5;
        freq *= 2.0;
    }
    return value;
}

void main() {
    vec2 dims = vec2(textureSize(inputTex, 0));
    
    // Get noise value to drive refraction
    vec2 baseFreq = vec2(freq);
    if (dims.x > dims.y) {
        baseFreq.y *= dims.x / dims.y;
    } else {
        baseFreq.x *= dims.y / dims.x;
    }
    
    float noiseVal = fbm(v_texCoord * baseFreq, time);
    
    // Convert noise to angle
    float angle = noiseVal * TAU;
    
    // Calculate refraction offset
    float displaceAmount = displacement * 0.1;
    vec2 offset = vec2(cos(angle), sin(angle)) * displaceAmount;
    
    // Sample with offset
    vec2 sampleCoord = v_texCoord + offset;
    sampleCoord = fract(sampleCoord);  // Wrap around
    
    vec4 sampled = texture(inputTex, sampleCoord);
    
    fragColor = sampled;
}
