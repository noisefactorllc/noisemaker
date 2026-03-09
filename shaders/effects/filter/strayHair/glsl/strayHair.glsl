/*
 * Stray Hair - sparse dark worm traces over the image (single-pass)
 *
 * Traces worms through a procedural low-freq noise flow field.
 * Unruly behavior: base rotation + per-worm variation.
 * Dark strands, like hairs on a camera lens.
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

uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hashf(uint n) {
    return float(pcg(n)) / 4294967295.0;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 base = texture(inputTex, uv);

    float maxDim = max(resolution.x, resolution.y);
    uint seedBase = uint(seed) * 99991u;

    // Density: 2..5 worms, trail width scales
    int wormCount = 2 + int(density * 3.0);
    float kink = 3.0 + hashf(seedBase + 600u) * 7.0;
    float trailWidth = maxDim / 48.0 * (0.5 + density);
    float baseRot = hashf(seedBase + 700u) * TAU;
    uint noiseSeed = pcg(seedBase + 800u);

    float totalMask = 0.0;

    for (int w = 0; w < 5; w++) {
        if (w >= wormCount) break;

        uint wSeed = seedBase + uint(w) * 13337u;
        float wy = hashf(wSeed) * resolution.y;
        float wx = hashf(wSeed + 1u) * resolution.x;
        float wormVar = (hashf(wSeed + 2u) - 0.5) * 0.25;

        // Large stride for long sweeping trails
        float wStride = maxDim / 40.0 + (hashf(wSeed + 3u) - 0.5) * maxDim / 80.0;

        for (int step = 0; step < 40; step++) {
            float t = float(step) / 39.0;
            float exposure = 1.0 - abs(1.0 - t * 2.0);

            vec2 diff = gl_FragCoord.xy - vec2(wx, wy);
            if (diff.x > resolution.x * 0.5) diff.x -= resolution.x;
            if (diff.x < -resolution.x * 0.5) diff.x += resolution.x;
            if (diff.y > resolution.y * 0.5) diff.y -= resolution.y;
            if (diff.y < -resolution.y * 0.5) diff.y += resolution.y;

            float dist = length(diff);
            if (dist < trailWidth) {
                totalMask += exposure * (1.0 - dist / trailWidth);
            }

            // Flow field: 8x8 grid hash for gentle direction changes
            vec2 wormUv = vec2(mod(wx, resolution.x), mod(wy, resolution.y)) / resolution;
            vec2 cell = floor(wormUv * 8.0);
            float field = hashf(noiseSeed + uint(cell.x * 73.0 + cell.y * 157.0));
            float flowAngle = field * TAU * kink + baseRot + wormVar;

            wy = mod(wy + cos(flowAngle) * wStride, resolution.y);
            wx = mod(wx + sin(flowAngle) * wStride, resolution.x);
        }
    }

    float mask = sqrt(clamp(totalMask, 0.0, 1.0));

    // Brightness noise (freq=32), multiply by 0.333 for dark strands
    vec2 quantized = floor(gl_FragCoord.xy / (resolution / 32.0));
    uint bSeed = seedBase + 999983u;
    vec3 brightness = vec3(
        hashf(bSeed + uint(quantized.x * 73.0 + quantized.y * 157.0)),
        hashf(bSeed + uint(quantized.x * 79.0 + quantized.y * 311.0)),
        hashf(bSeed + uint(quantized.x * 83.0 + quantized.y * 191.0))
    ) * 0.333;

    // Python: blend(tensor, brightness * 0.333, mask * 0.666)
    float blendAmt = mask * 0.666 * alpha;

    // Subtle global lens grime — density affects overall darkening
    float grime = 1.0 - density * 0.05 * alpha;
    vec3 result = mix(base.rgb * grime, brightness, blendAmt);

    fragColor = vec4(result, base.a);
}
