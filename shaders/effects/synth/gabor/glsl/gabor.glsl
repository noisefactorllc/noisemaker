/*
 * Gabor noise — sparse convolution of anisotropic Gabor kernels.
 * Each grid cell scatters random impulse points; the final value is the sum
 * of Gabor kernel contributions from the 3×3 cell neighborhood.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float seed;
uniform float scale;
uniform float orientation;
uniform float bandwidth;
uniform float isotropy;
uniform float density;
uniform float octaves;
uniform float speed;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

// PCG PRNG - MIT License
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(0xffffffffu);
}

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// Sum Gabor kernels from 3×3 cell neighborhood
float gaborNoise(vec2 st, float freq, float sigma, float baseAngle, float iso, int impulses, float t, float sd) {
    vec2 cell = floor(st);
    vec2 frac = fract(st);
    float sum = 0.0;

    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 neighbor = vec2(float(dx), float(dy));
            vec2 cellId = cell + neighbor;

            for (int k = 0; k < 8; k++) {
                if (k >= impulses) break;

                // Random impulse position and properties
                vec3 r1 = prng(vec3(cellId, sd + float(k) * 7.0));
                vec3 r2 = prng(vec3(sd + float(k) * 13.0, cellId));

                vec2 impulsePos = r1.xy;
                // Animate with time*TAU for clean 0-1 looping
                impulsePos += vec2(sin(t + r2.x * TAU), cos(t + r2.y * TAU)) * 0.15;

                vec2 delta = neighbor + impulsePos - frac;

                // Per-impulse orientation: blend between fixed angle and random
                float angle = mix(baseAngle, r2.z * TAU, iso);
                vec2 dir = vec2(cos(angle), sin(angle));

                // Random weight ±1
                float weight = r1.z < 0.5 ? -1.0 : 1.0;

                float envelope = exp(-dot(delta, delta) / (2.0 * sigma * sigma));
                float phase = TAU * freq * dot(dir, delta);
                sum += weight * envelope * cos(phase);
            }
        }
    }
    return sum;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 st = globalCoord / fullResolution.y;

    float freq = map(scale, 1.0, 100.0, 20.0, 1.0);
    float sigma = map(bandwidth, 1.0, 100.0, 0.05, 0.35);
    float baseAngle = orientation * PI / 180.0;
    float iso = isotropy / 100.0;
    int impulses = int(density);
    int oct = int(octaves);
    float spd = floor(speed);
    float t = time * TAU * spd;

    vec2 p = st * freq;

    // Fractal octave summation
    float value = 0.0;
    float amplitude = 1.0;
    float totalAmp = 0.0;
    vec2 pOct = p;

    for (int i = 0; i < 5; i++) {
        if (i >= oct) break;
        float octFreq = 1.0 + float(i) * 0.5;
        float octSigma = sigma / (1.0 + float(i) * 0.5);
        float fi = float(i);
        value += amplitude * gaborNoise(pOct, octFreq, octSigma, baseAngle, iso, impulses, t + fi * 3.7, seed + fi * 17.0);
        totalAmp += amplitude;
        amplitude *= 0.5;
        pOct *= 2.0;
    }
    value /= totalAmp;

    float n = 1.0 / (1.0 + exp(-value * 3.0));
    fragColor = vec4(vec3(n), 1.0);
}
