#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float scale;
uniform float seed;
uniform float speed;
uniform float strength;
uniform int octaves;
uniform int noiseType;
uniform int outputMode;

out vec4 fragColor;

const float TAU = 6.283185307179586;
const float EPSILON = 0.001;

// PCG PRNG
uvec3 pcg(uvec3 v) {
    v = v * uint(1664525) + uint(1013904223);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> uint(16);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}

// Quintic interpolation for smooth transitions
float quintic(float t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float smoothlerp(float x, float a, float b) {
    return a + quintic(x) * (b - a);
}

// 2D periodic grid function - gradient angle animates with time
float grid2D(vec2 st, vec2 cell) {
    float angle = prng(vec3(cell + seed, 1.0)).r * TAU;
    angle += time * TAU * speed;  // Animate gradient rotation
    vec2 gradient = vec2(cos(angle), sin(angle));
    vec2 dist = st - cell;
    return dot(gradient, dist);
}

// 2D periodic Perlin noise - time animates gradient angles for seamless loop
float noise2D(vec2 st) {
    vec2 cell = floor(st);
    vec2 f = fract(st);
    
    float tl = grid2D(st, cell);
    float tr = grid2D(st, vec2(cell.x + 1.0, cell.y));
    float bl = grid2D(st, vec2(cell.x, cell.y + 1.0));
    float br = grid2D(st, cell + 1.0);
    
    float upper = smoothlerp(f.x, tl, tr);
    float lower = smoothlerp(f.x, bl, br);
    float val = smoothlerp(f.y, upper, lower);
    
    return val;  // Returns -1..1
}

float cubic(float t) {
    return t * t * (3.0 - 2.0 * t);
}

float catmullRom(float p0, float p1, float p2, float p3, float t) {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}

// Value noise functions
float valueNoise(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    // Get corner values
    float a = prng(vec3(i, t + seed)).x;
    float b = prng(vec3(i + vec2(1.0, 0.0), t + seed)).x;
    float c = prng(vec3(i + vec2(0.0, 1.0), t + seed)).x;
    float d = prng(vec3(i + vec2(1.0, 1.0), t + seed)).x;
    
    // Interpolate
    float u, v;
    if (noiseType == 1) {
        // Linear
        u = f.x;
        v = f.y;
    } else if (noiseType == 2) {
        // Hermite (smoothstep)
        u = cubic(f.x);
        v = cubic(f.y);
    } else if (noiseType == 3) {
        // Catmull-Rom (needs 4x4 grid, simplified here with smootherstep)
        u = quintic(f.x);
        v = quintic(f.y);
    } else {
        u = f.x;
        v = f.y;
    }
    
    float x1 = mix(a, b, u);
    float x2 = mix(c, d, u);
    return mix(x1, x2, v);
}

// Main noise function selector
float noise(vec2 p, float t) {
    if (noiseType == 0) {
        // Perlin noise - use time as angle for gradient rotation
        return noise2D(p);
    } else {
        return valueNoise(p, t) * 2.0 - 1.0;
    }
}

// Multi-octave noise (FBM)
float fbm(vec2 p, float t) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    int oct = clamp(octaves, 1, 6);
    
    for (int i = 0; i < 6; i++) {
        if (i >= oct) break;
        value += amplitude * noise(p * frequency, t);
        maxValue += amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    
    return value / maxValue;
}

// Curl noise: compute curl of potential field
// curl(P) = (dP/dy, -dP/dx) for 2D
vec2 curlNoise(vec2 p, float t) {
    // Sample noise with small offsets to compute derivatives
    float dx = fbm(p + vec2(EPSILON, 0.0), t) - fbm(p - vec2(EPSILON, 0.0), t);
    float dy = fbm(p + vec2(0.0, EPSILON), t) - fbm(p - vec2(0.0, EPSILON), t);
    
    // Curl is perpendicular to gradient
    // For 2D: curl = (dP/dy, -dP/dx)
    return vec2(dy, -dx) / (2.0 * EPSILON);
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution.y;
    float aspect = resolution.x / resolution.y;
    
    // Center coordinates
    vec2 centered = st - vec2(aspect * 0.5, 0.5);
    
    // Scale coordinates
    vec2 p = centered * (100.0 / scale);
    
    // Animate with time
    float t = time * speed * 0.1;
    
    // Compute curl noise
    vec2 curl = curlNoise(p, t) * strength;
    
    // Visualize the curl field as color
    // Map the 2D vector to RGB
    vec3 color;
    
    // Use curl vector components for R and G
    // Normalize to 0-1 range
    color.r = curl.x * 0.5 + 0.5;
    color.g = curl.y * 0.5 + 0.5;
    
    // Blue channel shows the magnitude
    float magnitude = length(curl);
    color.b = magnitude;
    
    // Apply output mode
    if (outputMode == 0) {
        // Flow X
        color = vec3(color.r);
    } else if (outputMode == 1) {
        // Flow Y
        color = vec3(color.g);
    } else if (outputMode == 2) {
        // Direction
        color = vec3(color.r, color.g, 0.0);
    }
    // else output == 3: Direction + Magnitude (default, already set)
    
    fragColor = vec4(color, 1.0);
}
