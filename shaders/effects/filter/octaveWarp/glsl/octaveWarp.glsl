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
uniform float time;
uniform float frequency;
uniform float octaves;
uniform float displacement;
uniform float speed;
uniform float splineOrder;

out vec4 fragColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;

// Hash functions
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

// Multi-octave noise for smoother results
float simplexNoise(vec2 p, float t) {
    float n = noise(p + t * 0.1);
    n += noise(p * 2.0 - t * 0.15) * 0.5;
    n += noise(p * 4.0 + t * 0.2) * 0.25;
    return n / 1.75;
}

float wrapFloat(float value, float limit) {
    if (limit <= 0.0) return 0.0;
    float result = mod(value, limit);
    if (result < 0.0) result += limit;
    return result;
}

float applySpline(float value, int order) {
    float clamped = clamp(value, 0.0, 1.0);
    if (order == 2) {
        return 0.5 - cos(clamped * PI) * 0.5;
    }
    return clamped;
}

vec4 sampleNearest(vec2 coord, vec2 dims) {
    vec2 uv = vec2(
        wrapFloat(coord.x, dims.x),
        wrapFloat(coord.y, dims.y)
    ) / dims;
    return texture(inputTex, uv);
}

vec4 sampleBilinear(vec2 coord, vec2 dims, int order) {
    float x0f = floor(coord.x);
    float y0f = floor(coord.y);
    int x0 = int(x0f);
    int y0 = int(y0f);
    int w = int(dims.x);
    int h = int(dims.y);

    float fx = applySpline(coord.x - x0f, order);
    float fy = applySpline(coord.y - y0f, order);

    vec2 uv00 = vec2(wrapFloat(float(x0), dims.x), wrapFloat(float(y0), dims.y)) / dims;
    vec2 uv10 = vec2(wrapFloat(float(x0 + 1), dims.x), wrapFloat(float(y0), dims.y)) / dims;
    vec2 uv01 = vec2(wrapFloat(float(x0), dims.x), wrapFloat(float(y0 + 1), dims.y)) / dims;
    vec2 uv11 = vec2(wrapFloat(float(x0 + 1), dims.x), wrapFloat(float(y0 + 1), dims.y)) / dims;

    vec4 tex00 = texture(inputTex, uv00);
    vec4 tex10 = texture(inputTex, uv10);
    vec4 tex01 = texture(inputTex, uv01);
    vec4 tex11 = texture(inputTex, uv11);

    vec4 mixX0 = mix(tex00, tex10, fx);
    vec4 mixX1 = mix(tex01, tex11, fx);
    return mix(mixX0, mixX1, fy);
}

vec4 cubicInterp(vec4 a, vec4 b, vec4 c, vec4 d, float t) {
    float t2 = t * t;
    float t3 = t2 * t;
    vec4 a0 = d - c - a + b;
    vec4 a1 = a - b - a0;
    vec4 a2 = c - a;
    return a0 * t3 + a1 * t2 + a2 * t + b;
}

vec4 sampleBicubic(vec2 coord, vec2 dims) {
    int bx = int(floor(coord.x));
    int by = int(floor(coord.y));
    float fx = coord.x - floor(coord.x);
    float fy = coord.y - floor(coord.y);

    vec4 cols[4];
    for (int m = -1; m <= 2; m++) {
        vec4 row[4];
        for (int n = -1; n <= 2; n++) {
            vec2 uv = vec2(
                wrapFloat(float(bx + n), dims.x),
                wrapFloat(float(by + m), dims.y)
            ) / dims;
            row[n + 1] = texture(inputTex, uv);
        }
        cols[m + 1] = cubicInterp(row[0], row[1], row[2], row[3], fx);
    }
    return cubicInterp(cols[0], cols[1], cols[2], cols[3], fy);
}

vec4 sampleWithOrder(vec2 coord, vec2 dims, int order) {
    vec2 wrapped = vec2(
        wrapFloat(coord.x, dims.x),
        wrapFloat(coord.y, dims.y)
    );
    if (order <= 0) return sampleNearest(wrapped, dims);
    if (order >= 3) return sampleBicubic(wrapped, dims);
    return sampleBilinear(wrapped, dims, order);
}

void main() {
    vec2 dims = resolution;
    float width = dims.x;
    float height = dims.y;

    // Adjust frequency for aspect ratio
    vec2 freq = vec2(frequency);
    if (width > height && height > 0.0) {
        freq.y = frequency * width / height;
    } else if (height > width && width > 0.0) {
        freq.x = frequency * height / width;
    }

    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 sampleCoord = uv * dims;

    int numOctaves = max(int(octaves), 1);
    float displaceBase = displacement;

    // Per-octave warping
    for (int octave = 1; octave <= 10; octave++) {
        if (octave > numOctaves) break;

        float multiplier = pow(2.0, float(octave));
        vec2 freqScaled = freq * 0.5 * multiplier;

        if (freqScaled.x >= width || freqScaled.y >= height) break;

        // Compute reference angles from noise
        vec2 noiseCoord = (sampleCoord / dims) * freqScaled;
        float refX = simplexNoise(noiseCoord + vec2(17.0, 29.0), time * speed);
        float refY = simplexNoise(noiseCoord + vec2(23.0, 31.0), time * speed);

        // Convert to signed range
        refX = refX * 2.0 - 1.0;
        refY = refY * 2.0 - 1.0;

        // Calculate displacement (decreases with each octave)
        float displaceScale = displaceBase / multiplier;
        vec2 offset = vec2(refX * displaceScale * width, refY * displaceScale * height);

        sampleCoord += offset;
        sampleCoord = vec2(
            wrapFloat(sampleCoord.x, width),
            wrapFloat(sampleCoord.y, height)
        );
    }

    vec4 sampled = sampleWithOrder(sampleCoord, dims, int(splineOrder));
    fragColor = sampled;
}
