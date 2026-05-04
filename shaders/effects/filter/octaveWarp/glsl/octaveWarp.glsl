/*
 * Octave Warp - per-octave noise warp distortion
 * For each octave i, generates noise at frequency×2^i, uses it to
 * displace UV coordinates, samples input at displaced position.
 * Displacement decreases with each octave (displacement / 2^i).
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float frequency;
uniform float octaves;
uniform float displacement;
uniform float speed;
uniform float wrap;
uniform float seed;
uniform bool antialias;

out vec4 fragColor;

// PCG PRNG
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

float hash21(vec2 p) {
    uvec3 v = uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        uint(seed)
    );
    return float(pcg(v).x) / float(0xffffffffu);
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

const float TAU = 6.28318530717959;

// Multi-octave noise for smoother results
// Uses circular path through noise space so t=0 and t=1 are seamless
// phase offsets the angle per octave, radius scales the circular path
float simplexNoise(vec2 p, float t, float phase, float radius) {
    float angle = t * TAU + phase;
    float cx = cos(angle) * radius;
    float cy = sin(angle) * radius;
    float n = noise(p + vec2(cx, cy));
    n += noise(p * 2.0 + vec2(-cy, cx) * 0.75) * 0.5;
    n += noise(p * 4.0 + vec2(cx, -cy) * 0.5) * 0.25;
    return n / 1.75;
}

float wrapFloat(float value, float limit, int mode) {
    if (limit <= 0.0) return 0.0;
    float norm = value / limit;
    if (mode == 0) {
        // Mirror
        norm = abs(mod(norm + 1.0, 2.0) - 1.0);
    } else if (mode == 1) {
        // Repeat
        norm = mod(norm, 1.0);
        if (norm < 0.0) norm += 1.0;
    } else {
        // Clamp
        norm = clamp(norm, 0.0, 1.0);
    }
    return norm * limit;
}

void main() {
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    vec2 dims = fullRes;
    float width = dims.x;
    float height = dims.y;

    // Adjust frequency for aspect ratio
    float baseFreq = 11.0 - frequency;
    float aspect = width / height;
    vec2 freq = vec2(baseFreq);
    if (aspect > 1.0) {
        freq.y *= aspect;
    } else {
        freq.x /= aspect;
    }

    vec2 uv = (gl_FragCoord.xy + tileOffset) / fullRes;
    vec2 sampleCoord = uv * dims;

    int numOctaves = max(int(octaves), 1);
    float displaceBase = displacement;

    // Per-octave warping
    for (int octave = 1; octave <= 10; octave++) {
        if (octave > numOctaves) break;

        float multiplier = pow(2.0, float(octave));
        vec2 freqScaled = freq * 0.5 * multiplier;

        if (freqScaled.x >= width || freqScaled.y >= height) break;

        // Per-octave phase and radius break up uniform circular motion
        float phase = float(octave) * 2.399;  // golden angle
        float radius = 0.5 / sqrt(multiplier);

        // Compute reference angles from noise
        vec2 noiseCoord = (sampleCoord / dims) * freqScaled;
        float refX = simplexNoise(noiseCoord + vec2(17.0, 29.0), time * speed, phase, radius);
        float refY = simplexNoise(noiseCoord + vec2(23.0, 31.0), time * speed, phase, radius);

        // Convert to signed range
        refX = refX * 2.0 - 1.0;
        refY = refY * 2.0 - 1.0;

        // Calculate displacement (decreases with each octave)
        float displaceScale = displaceBase / multiplier;
        vec2 offset = vec2(refX * displaceScale * width, refY * displaceScale * height);

        sampleCoord += offset;
        sampleCoord = vec2(
            wrapFloat(sampleCoord.x, width, int(wrap)),
            wrapFloat(sampleCoord.y, height, int(wrap))
        );
    }

    vec2 finalUV = vec2(
        wrapFloat(sampleCoord.x, width, int(wrap)),
        wrapFloat(sampleCoord.y, height, int(wrap))
    ) / dims;
    if (antialias) {
        vec2 dx = dFdx(finalUV);
        vec2 dy = dFdy(finalUV);
        vec4 col = vec4(0.0);
        col += texture(inputTex, finalUV + dx * -0.375 + dy * -0.125);
        col += texture(inputTex, finalUV + dx *  0.125 + dy * -0.375);
        col += texture(inputTex, finalUV + dx *  0.375 + dy *  0.125);
        col += texture(inputTex, finalUV + dx * -0.125 + dy *  0.375);
        fragColor = col * 0.25;
    } else {
        fragColor = texture(inputTex, finalUV);
    }
}
