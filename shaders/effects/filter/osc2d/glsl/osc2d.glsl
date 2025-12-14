#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform float time;
uniform int oscType;
uniform int frequency;
uniform float speed;
uniform float rotation;
uniform float seed;

out vec4 fragColor;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// Simple 2D hash for noise
float hash21(vec2 p, float s) {
    p = fract(p * vec2(234.34, 435.345) + s);
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

// Value noise 2D
float noise2D(vec2 p, float s) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash21(i, s);
    float b = hash21(i + vec2(1.0, 0.0), s);
    float c = hash21(i + vec2(0.0, 1.0), s);
    float d = hash21(i + vec2(1.0, 1.0), s);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Looping noise - samples on a circle for seamless temporal loops
float loopingNoise(float spatial, float temporal, float s) {
    // temporal is 0..1 over one loop cycle
    // Sample noise on a circle so start meets end
    float angle = temporal * TAU;
    float radius = 2.0;  // Controls noise detail in time dimension
    vec2 loopCoord = vec2(cos(angle), sin(angle)) * radius;
    // Combine with spatial coordinate
    vec3 coord = vec3(spatial * 5.0, loopCoord);
    // Use 2D noise slices combined for pseudo-3D
    float n1 = noise2D(coord.xy + s, s);
    float n2 = noise2D(coord.xz + s * 2.0, s);
    return mix(n1, n2, 0.5);
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
    
    // The oscillator value is based on position along y-axis
    // frequency controls how many bands appear across the image
    // speed controls how fast the animation runs
    float spatialPhase = st.y * float(frequency);
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
    } else {
        // noise (oscType == 5) - seamlessly looping
        float spatial = st.y * float(frequency);
        float temporal = fract(time * speed);
        val = loopingNoise(spatial, temporal, seed);
    }
    
    fragColor = vec4(vec3(val), 1.0);
}
