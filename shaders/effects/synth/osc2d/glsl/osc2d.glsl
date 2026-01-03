#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float time;
uniform int oscType;
uniform int frequency;
uniform float speed;
uniform float rotation;
uniform int seed;

out vec4 fragColor;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// Simple 1D hash for noise
float hash11(float p, float s) {
    p = fract(p * 234.34 + s);
    p += p * (p + 34.23);
    return fract(p * p);
}

// Value noise 1D - tiles at integer frequency boundaries
float tilingNoise1D(float x, float freq, float s) {
    // x is in [0, 1] range, scale by frequency
    float p = x * freq;
    float i = floor(p);
    float f = fract(p);
    f = f * f * (3.0 - 2.0 * f);  // smoothstep
    
    // Wrap indices for seamless tiling
    float i0 = mod(i, freq);
    float i1 = mod(i + 1.0, freq);
    
    float a = hash11(i0, s);
    float b = hash11(i1, s);
    
    return mix(a, b, f);
}

// Periodic value function: h/t Etienne Jacob
// https://bleuje.github.io/tutorial2/
// Python: periodic_value(time, value) = normalized_sine((time - value) * tau)
float periodicValue(float t, float v) {
    return (sin((t - v) * TAU) + 1.0) * 0.5;
}

// Rotate 2D coordinates
vec2 rotate2D(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// All oscillator functions return 0->1->0 over t=0..1
float oscSine(float t) {
    // Use half-cycle sine: 0->1->0 over t=0..1
    return sin(fract(t) * PI);
}

float oscLinear(float t) {
    // Triangle wave: 0->1->0 over t=0..1
    t = fract(t);
    return 1.0 - abs(t * 2.0 - 1.0);
}

float oscSawtooth(float t) {
    // Sawtooth: 0->1 over t=0..1
    return fract(t);
}

float oscSawtoothInv(float t) {
    // Inverted sawtooth: 1->0 over t=0..1
    return 1.0 - fract(t);
}

float oscSquare(float t) {
    // Square wave: 0 or 1
    return step(0.5, fract(t));
}

void main() {
    vec2 res = resolution;
    if (res.x < 1.0) res = vec2(1024.0, 1024.0);
    
    // Normalized coordinates
    vec2 st = gl_FragCoord.xy / res;
    
    // Center for rotation
    st -= 0.5;
    st.x *= aspect;
    
    // Apply rotation
    float rotRad = rotation * PI / 180.0;
    st = rotate2D(st, rotRad);
    
    // Spatial position in [0, 1] for noise sampling
    float spatialPos = st.y + 0.5;
    float freq = float(frequency);
    
    // The oscillator value is based on position along y-axis
    // frequency controls how many bands appear across the image
    // speed controls how fast the animation runs
    float spatialPhase = st.y * freq;
    float timePhase = time * speed;
    float t = spatialPhase + timePhase;
    
    float val;
    if (oscType == 0) {
        // Sine
        val = oscSine(t);
    } else if (oscType == 1) {
        // Linear (triangle)
        val = oscLinear(t);
    } else if (oscType == 2) {
        // Sawtooth
        val = oscSawtooth(t);
    } else if (oscType == 3) {
        // Sawtooth inverted
        val = oscSawtoothInv(t);
    } else if (oscType == 4) {
        // Square
        val = oscSquare(t);
    } else if (oscType == 5) {
        // noise1d - scrolling version of noise2d
        // At t=0, must match noise2d exactly
        // Then scrolls the pattern over time
        float scrollOffset = fract(time * speed);
        float scrolledPos = fract(spatialPos + scrollOffset);
        
        // Same computation as noise2d at t=0
        float timeNoise = tilingNoise1D(scrolledPos, freq, float(seed) + 12345.0);
        float valueNoise = tilingNoise1D(scrolledPos, freq, float(seed));
        float scaledTime = periodicValue(0.0, timeNoise) * speed;
        val = periodicValue(scaledTime, valueNoise);
    } else {
        // noise2d (oscType == 6) - two-stage periodic
        // Python: scaled_time = periodic_value(time, time_noise) * speed
        //         result = periodic_value(scaled_time, value_noise)
        
        // Get noise values at this spatial position (same sampling as noise1d)
        float timeNoise = tilingNoise1D(spatialPos, freq, float(seed) + 12345.0);
        float valueNoise = tilingNoise1D(spatialPos, freq, float(seed));
        
        // Two-stage periodic: time -> periodic -> scale -> periodic
        float scaledTime = periodicValue(time, timeNoise) * speed;
        val = periodicValue(scaledTime, valueNoise);
    }
    
    fragColor = vec4(vec3(val), 1.0);
}
