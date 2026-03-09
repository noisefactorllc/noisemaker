/*
 * Fibers - Chaotic fiber texture overlay (single-pass)
 *
 * Traces worms through a flow field derived from input luminance.
 * 4 layers, each with ~13 chaotic worms, ~25 iterations.
 * Each pixel checks proximity to all worm trails and accumulates exposure.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float density;
uniform int seed;
uniform float alpha;

out vec4 fragColor;

const float TAU = 6.283185307179586;
const float PI = 3.14159265358979;

// PCG hash
uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hashf(uint n) {
    return float(pcg(n)) / 4294967295.0;
}

float luminance(vec3 rgb) {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 base = texture(inputTex, uv);

    float maxDim = max(resolution.x, resolution.y);
    float minDim = min(resolution.x, resolution.y);
    int iterations = int(sqrt(minDim));  // ~25 for 640px
    float trailWidth = maxDim / 512.0;   // scale with resolution

    // Worm count per layer: density maps 0..1 to ~5..25 worms
    int wormCount = max(3, int(mix(5.0, 25.0, density)));

    uint seedBase = uint(seed) * 99991u;
    float totalMask = 0.0;
    vec3 totalBrightness = vec3(0.0);

    // 4 layers (matching Python's for i in range(4))
    for (int layer = 0; layer < 4; layer++) {
        uint layerSeed = seedBase + uint(layer) * 77773u;
        float layerMask = 0.0;

        for (int w = 0; w < 25; w++) {  // max worm count
            if (w >= wormCount) break;

            uint wSeed = layerSeed + uint(w) * 13337u;

            // Spawn position (random across canvas)
            float wy = hashf(wSeed) * resolution.y;
            float wx = hashf(wSeed + 1u) * resolution.x;

            // Chaotic: random initial heading
            float wRot = hashf(wSeed + 2u) * TAU;

            // Stride with deviation (Python: mean=0.75, stddev=0.125, scaled by maxDim/1024)
            float strideMean = 0.75 * (maxDim / 1024.0);
            float strideVal = strideMean + (hashf(wSeed + 3u) - 0.5) * 2.0 * 0.125 * (maxDim / 1024.0);

            // Kink: random 5-10 (Python: rng.random_int(5, 10))
            float kink = 5.0 + hashf(wSeed + 4u) * 5.0;

            // Walk the worm and check distance to this pixel
            for (int step = 0; step < 50; step++) {  // max iterations
                if (step >= iterations) break;

                // Exposure ramp: 0 -> 1 -> 0 over lifetime
                float t = float(step) / float(iterations - 1);
                float exposure = 1.0 - abs(1.0 - t * 2.0);

                // Distance from pixel to worm position (with wrapping)
                vec2 wormPos = vec2(wx, wy);
                vec2 diff = gl_FragCoord.xy - wormPos;

                // Handle wrapping
                if (diff.x > resolution.x * 0.5) diff.x -= resolution.x;
                if (diff.x < -resolution.x * 0.5) diff.x += resolution.x;
                if (diff.y > resolution.y * 0.5) diff.y -= resolution.y;
                if (diff.y < -resolution.y * 0.5) diff.y += resolution.y;

                float dist = length(diff);

                // Accumulate if within trail width
                if (dist < trailWidth) {
                    float falloff = 1.0 - dist / trailWidth;
                    layerMask += exposure * falloff;
                }

                // Advance worm: sample flow field at current position
                vec2 wormUv = vec2(mod(wx, resolution.x), mod(wy, resolution.y)) / resolution;
                float lum = luminance(texture(inputTex, wormUv).rgb);
                float flowAngle = lum * TAU * kink + wRot;

                wy = mod(wy + cos(flowAngle) * strideVal, resolution.y);
                wx = mod(wx + sin(flowAngle) * strideVal, resolution.x);
            }
        }

        // Per-layer brightness (hash-based, approximating values(freq=128))
        uint bSeed = layerSeed + 999983u;
        vec3 layerBright = vec3(
            hashf(bSeed + uint(gl_FragCoord.x * 0.73 + gl_FragCoord.y * 127.1) + uint(layer) * 31u),
            hashf(bSeed + uint(gl_FragCoord.x * 0.79 + gl_FragCoord.y * 311.7) + uint(layer) * 37u),
            hashf(bSeed + uint(gl_FragCoord.x * 0.83 + gl_FragCoord.y * 191.3) + uint(layer) * 41u)
        );

        // Python: blend(tensor, brightness, mask * 0.5)
        // Normalize and sqrt the mask (matching Python's sqrt(normalize(out)))
        float mask = clamp(layerMask, 0.0, 1.0);
        mask = sqrt(mask);
        float blendAmt = mask * 0.5;

        totalMask += blendAmt;
        totalBrightness += layerBright * blendAmt;
    }

    // Composite all layers
    vec3 result = base.rgb;
    if (totalMask > 0.0) {
        vec3 fiberColor = totalBrightness / max(totalMask, 0.001);
        result = mix(base.rgb, fiberColor, clamp(totalMask, 0.0, 1.0) * alpha);
    }

    fragColor = vec4(result, base.a);
}
