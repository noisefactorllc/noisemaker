#version 300 es

precision highp float;
precision highp int;

// Reindex Pass 2 (Reduce): collapse tile statistics to a global min/max pair.

const float F32_MAX = 3.402823466e38;
const float F32_MIN = -3.402823466e38;
const int TILE_SIZE = 8;
const int MAX_TILE_DIM = 512; // Supports resolutions up to 4096px.

uniform sampler2D statsTex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    // Single pixel output; ensure only the first fragment runs the reduction.
    if (int(gl_FragCoord.x) != 0 || int(gl_FragCoord.y) != 0) {
        fragColor = vec4(0.0);
        return;
    }

    ivec2 tileCount = ivec2(
        (int(resolution.x) + TILE_SIZE - 1) / TILE_SIZE,
        (int(resolution.y) + TILE_SIZE - 1) / TILE_SIZE
    );

    float globalMin = F32_MAX;
    float globalMax = F32_MIN;

    for (int ty = 0; ty < MAX_TILE_DIM; ++ty) {
        if (ty >= tileCount.y) break;
        for (int tx = 0; tx < MAX_TILE_DIM; ++tx) {
            if (tx >= tileCount.x) break;
            ivec2 sampleCoord = ivec2(tx * TILE_SIZE, ty * TILE_SIZE);
            vec2 tileStats = texelFetch(statsTex, sampleCoord, 0).xy;
            globalMin = min(globalMin, tileStats.x);
            globalMax = max(globalMax, tileStats.y);
        }
    }

    fragColor = vec4(globalMin, globalMax, 0.0, 1.0);
}