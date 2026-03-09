/*
 * Scratches - film scratch overlay using worm tracing (single-pass)
 *
 * 4 layers of worm traces, each max-blended.
 * Low kink produces nearly-straight scratches.
 * Subtractive noise creates breaks/gaps.
 * Bright white scratches (mask * 8.0, clamped).
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float time;
uniform float density;
uniform float alpha;
uniform int seed;
uniform float speed;

out vec4 fragColor;

const float TAU = 6.283185307179586;

uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hashf(uint n) {
    return float(pcg(n)) / 4294967295.0;
}

float valueNoise(vec2 uv, float freq, uint nSeed) {
    vec2 p = uv * freq;
    vec2 cell = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float tl = hashf(pcg(uint(cell.x * 73.0 + cell.y * 157.0) + nSeed));
    float tr = hashf(pcg(uint((cell.x + 1.0) * 73.0 + cell.y * 157.0) + nSeed));
    float bl = hashf(pcg(uint(cell.x * 73.0 + (cell.y + 1.0) * 157.0) + nSeed));
    float br = hashf(pcg(uint((cell.x + 1.0) * 73.0 + (cell.y + 1.0) * 157.0) + nSeed));
    return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 base = texture(inputTex, uv);

    float maxDim = max(resolution.x, resolution.y);
    uint seedBase = uint(seed) * 99991u;

    // Time-varying seed for animation
    uint timeSeed = uint(floor(time * speed * 2.0));

    float scratchMask = 0.0;

    // 4 layers of scratches
    for (int layer = 0; layer < 4; layer++) {
        uint lSeed = pcg(seedBase + uint(layer) * 77773u + timeSeed * 33331u);

        // Worm count scales with density: 5-30 worms per layer
        int wormCount = int(5.0 + hashf(lSeed) * 25.0);

        // Low kink: 0.125 + rand * 0.125
        float kink = 0.125 + hashf(lSeed + 1u) * 0.125;

        // Duration: ~50 steps
        int steps = 40 + int(hashf(lSeed + 2u) * 20.0);

        // Stride: 0.75 in UV, with deviation 0.5
        float baseStride = maxDim * 0.75 / float(steps);

        // Behavior: obedient (0) or chaotic (1)
        int behavior = int(hashf(lSeed + 3u) * 2.0);

        // Obedient: all worms share one heading
        float sharedAngle = hashf(lSeed + 4u) * TAU;

        // Flow field noise freq 2-4
        float flowFreq = 2.0 + hashf(lSeed + 5u) * 2.0;
        uint flowSeed = pcg(lSeed + 6u);

        // Subtractive noise freq 2-4
        float subFreq = 2.0 + hashf(lSeed + 7u) * 2.0;
        uint subSeed = pcg(lSeed + 8u);

        // Trail width: ~4px at 1024
        float trailWidth = maxDim / 256.0;

        float layerMask = 0.0;

        for (int w = 0; w < 30; w++) {
            if (w >= wormCount) break;

            uint wSeed = lSeed + uint(w) * 13337u + 10000u;

            // Random start position
            float wx = hashf(wSeed) * resolution.x;
            float wy = hashf(wSeed + 1u) * resolution.y;

            // Per-worm stride deviation
            float wStride = baseStride + (hashf(wSeed + 2u) - 0.5) * baseStride * 0.5;

            // Per-worm angle (chaotic mode)
            float wormAngle = hashf(wSeed + 3u) * TAU;

            for (int s = 0; s < 60; s++) {
                if (s >= steps) break;

                // Distance check with wrapping
                vec2 diff = gl_FragCoord.xy - vec2(wx, wy);
                if (diff.x > resolution.x * 0.5) diff.x -= resolution.x;
                if (diff.x < -resolution.x * 0.5) diff.x += resolution.x;
                if (diff.y > resolution.y * 0.5) diff.y -= resolution.y;
                if (diff.y < -resolution.y * 0.5) diff.y += resolution.y;

                float dist = length(diff);
                if (dist < trailWidth) {
                    layerMask += 1.0 - dist / trailWidth;
                }

                // Flow field direction
                vec2 wormUv = vec2(mod(wx, resolution.x), mod(wy, resolution.y)) / resolution;
                float field = valueNoise(wormUv, flowFreq, flowSeed);

                float angle;
                if (behavior == 0) {
                    // Obedient: shared heading + small flow deviation
                    angle = sharedAngle + (field - 0.5) * kink * TAU;
                } else {
                    // Chaotic: per-worm heading + flow deviation
                    angle = wormAngle + (field - 0.5) * kink * TAU;
                }

                wx = mod(wx + cos(angle) * wStride, resolution.x);
                wy = mod(wy + sin(angle) * wStride, resolution.y);
            }
        }

        // Subtractive noise creates breaks
        float subNoise = valueNoise(uv, subFreq, subSeed) * 2.0;
        layerMask = max(layerMask - subNoise, 0.0);

        // Bright: mask * 8.0, clamped — max-blend across layers
        scratchMask = max(scratchMask, min(layerMask * 8.0, 1.0));
    }

    // Density controls scratch intensity, alpha controls blend with input
    float scratchStrength = scratchMask * density;
    vec3 scratched = max(base.rgb, vec3(scratchStrength));
    vec3 finalResult = mix(base.rgb, scratched, alpha);

    fragColor = vec4(finalResult, base.a);
}
