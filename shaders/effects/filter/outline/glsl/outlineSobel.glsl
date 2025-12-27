#version 300 es

precision highp float;
precision highp int;

// Outline Sobel pass - edge detection with configurable metric

uniform sampler2D valueTexture;
uniform float sobelMetric;

out vec4 fragColor;

int wrapCoord(int value, int size) {
    if (size <= 0) {
        return 0;
    }
    int wrapped = value % size;
    if (wrapped < 0) {
        wrapped += size;
    }
    return wrapped;
}

float distanceMetric(float gx, float gy, int metric) {
    float abs_gx = abs(gx);
    float abs_gy = abs(gy);
    
    if (metric == 2) {
        // Manhattan
        return abs_gx + abs_gy;
    } else if (metric == 3) {
        // Chebyshev
        return max(abs_gx, abs_gy);
    } else if (metric == 4) {
        // Octagram
        float cross = (abs_gx + abs_gy) / 1.414;
        return max(cross, max(abs_gx, abs_gy));
    } else {
        // Euclidean (default)
        return sqrt(gx * gx + gy * gy);
    }
}

void main() {
    ivec2 dimensions = textureSize(valueTexture, 0);
    if (dimensions.x == 0 || dimensions.y == 0) {
        fragColor = vec4(0.0);
        return;
    }

    ivec2 coord = ivec2(gl_FragCoord.xy);
    int metric = int(sobelMetric);

    // Sample 3x3 neighborhood
    float samples[9];
    int idx = 0;
    for (int ky = -1; ky <= 1; ++ky) {
        for (int kx = -1; kx <= 1; ++kx) {
            int sampleX = wrapCoord(coord.x + kx, dimensions.x);
            int sampleY = wrapCoord(coord.y + ky, dimensions.y);
            samples[idx] = texelFetch(valueTexture, ivec2(sampleX, sampleY), 0).r;
            idx++;
        }
    }

    // Sobel X kernel: [-1 0 1; -2 0 2; -1 0 1]
    float gx = -samples[0] + samples[2] - 2.0*samples[3] + 2.0*samples[5] - samples[6] + samples[8];
    
    // Sobel Y kernel: [-1 -2 -1; 0 0 0; 1 2 1]
    float gy = -samples[0] - 2.0*samples[1] - samples[2] + samples[6] + 2.0*samples[7] + samples[8];

    float magnitude = distanceMetric(gx, gy, metric);
    // Boost edge visibility - multiply by 4 to make edges more visible
    float normalized = clamp(magnitude * 4.0, 0.0, 1.0);
    
    fragColor = vec4(normalized, normalized, normalized, 1.0);
}
