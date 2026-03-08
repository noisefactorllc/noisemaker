#version 300 es

precision highp float;
precision highp int;

// Wobble effect - offsets the entire frame using noise-driven jitter

uniform sampler2D inputTex;
uniform float time;
uniform float speed;
uniform float range;

in vec2 v_texCoord;
out vec4 fragColor;

const float TAU = 6.28318530717959;
const vec3 X_NOISE_SEED = vec3(17.0, 29.0, 11.0);
const vec3 Y_NOISE_SEED = vec3(41.0, 23.0, 7.0);

// Hash function for noise
float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float x0 = mix(n000, n100, f.x);
    float x1 = mix(n010, n110, f.x);
    float x2 = mix(n001, n101, f.x);
    float x3 = mix(n011, n111, f.x);

    float y0 = mix(x0, x1, f.y);
    float y1 = mix(x2, x3, f.y);

    return mix(y0, y1, f.z);
}

float simplexRandom(float t, float spd, vec3 seed) {
    float angle = t * TAU;
    // Include speed in the noise coordinates so output varies with speed even at time=0
    float z = cos(angle) * spd + seed.x + spd * 0.317;
    float w = sin(angle) * spd + seed.y + spd * 0.519;
    float n = noise3d(vec3(z, w, seed.z + spd * 0.1));
    return clamp(n, 0.0, 1.0);
}

void main() {
    // Speed directly affects the noise sampling position
    // This ensures changing speed produces different noise values
    float spd = max(speed, 0.001);
    float r = clamp(range, 0.0, 1.0);

    // Compute jitter offsets - speed affects both the noise input and output scale
    float xRandom = simplexRandom(time + speed * 0.1, spd, X_NOISE_SEED);
    float yRandom = simplexRandom(time + speed * 0.1, spd, Y_NOISE_SEED);

    // Scale offset by range - controls displacement amount
    float offsetScale = r * (0.01 + speed * 0.02);
    vec2 offset = (vec2(xRandom, yRandom) - 0.5) * offsetScale;

    // Apply offset to texture coordinate
    vec2 sampleCoord = v_texCoord + offset;
    sampleCoord = fract(sampleCoord);  // Wrap around

    vec4 sampled = texture(inputTex, sampleCoord);

    fragColor = sampled;
}
