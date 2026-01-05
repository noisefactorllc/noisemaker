#version 300 es
precision highp float;

// Kernel convolution pass
// Applies K(r) gaussian shell kernel to the density field

uniform sampler2D densityTex;  // Raw particle deposits
uniform vec2 resolution;

// Kernel parameters
uniform float muK;      // Kernel peak radius
uniform float sigmaK;   // Kernel width
uniform float searchRadius;  // Max radius to sample

out vec4 fragColor;

const float EPSILON = 0.0001;
const float PI = 3.14159265359;

// Gaussian shell kernel K(r) = exp(-((r - μ) / σ)²)
float kernel(float r, float mu, float sigma) {
    float x = (r - mu) / sigma;
    return exp(-x * x);
}

void main() {
    // Use the actual density texture size, not output resolution
    vec2 densitySize = vec2(textureSize(densityTex, 0));
    vec2 uv = gl_FragCoord.xy / densitySize;
    vec2 texelSize = 1.0 / densitySize;

    // Compute kernel weight for normalization
    // Integrate K(r) * r over [0, searchRadius]
    float wK = 0.0;
    int numSamples = 64;
    float dr = searchRadius / float(numSamples);
    for (int i = 0; i < numSamples; i++) {
        float r = (float(i) + 0.5) * dr;
        wK += kernel(r, muK, sigmaK) * r * dr;
    }
    wK = 1.0 / max(wK * 2.0 * PI, EPSILON);

    // Accumulate kernel-weighted density from neighbors
    float U = 0.0;
    int iRadius = int(ceil(searchRadius));

    for (int dy = -iRadius; dy <= iRadius; dy++) {
        for (int dx = -iRadius; dx <= iRadius; dx++) {
            float r = length(vec2(float(dx), float(dy)));

            // Skip if outside search radius
            if (r > searchRadius) continue;

            // Sample density at neighbor (wrap around edges)
            vec2 sampleUV = fract(uv + vec2(float(dx), float(dy)) * texelSize);
            float density = texture(densityTex, sampleUV).r;

            // Apply kernel weight
            float kVal = kernel(r, muK, sigmaK) * wK;
            U += density * kVal;
        }
    }

    // Output: r = U field, g = 0, b = 0, a = 1
    fragColor = vec4(U, 0.0, 0.0, 1.0);
}
