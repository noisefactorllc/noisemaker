#version 300 es

precision highp float;
precision highp int;

// Scratches: procedural film scratch overlay.
// Generates thin, mostly-vertical bright lines with breaks,
// additively blended onto the input image.

uniform sampler2D inputTex;
uniform float time;
uniform float density;
uniform float alpha;
uniform int seed;
uniform float speed;

out vec4 fragColor;

// Hash function for deterministic pseudo-random values
float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
}

float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// 1D noise for break patterns
float breakNoise(float y, float freq, float seedVal) {
    float scaled = y * freq;
    float i = floor(scaled);
    float f = fract(scaled);
    f = f * f * (3.0 - 2.0 * f);  // smoothstep
    float a = hash(i + seedVal * 17.3);
    float b = hash(i + 1.0 + seedVal * 17.3);
    return mix(a, b, f);
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    if (dims.x <= 0 || dims.y <= 0) {
        fragColor = vec4(0.0);
        return;
    }

    vec2 resolution = vec2(float(dims.x), float(dims.y));
    vec2 pixelPos = gl_FragCoord.xy;
    vec2 uv = pixelPos / resolution;

    vec4 base = texelFetch(inputTex, ivec2(pixelPos), 0);

    float timeOffset = time * speed * 60.0;

    // Number of scratch lines based on density
    int numScratches = max(int(density * 20.0), 1);

    float totalScratch = 0.0;

    for (int i = 0; i < 20; i++) {
        if (i >= numScratches) break;

        float fi = float(i);
        float seedBase = fi + float(seed) * 13.7;

        // Random x position for this scratch (0..1)
        float scratchX = hash(seedBase);

        // Slight angle: small deviation from vertical
        float angle = (hash(seedBase + 3.1) - 0.5) * 0.08;

        // Low-frequency sine wobble for slight curvature
        float wobbleFreq = 1.0 + hash(seedBase + 7.7) * 2.0;
        float wobblePhase = hash(seedBase + 11.3) * 6.2832;
        float wobbleAmp = (0.002 + hash(seedBase + 5.5) * 0.006);

        // Vertical scrolling for animation
        float scrollSpeed = (0.5 + hash(seedBase + 9.9) * 1.0) * speed;
        float yOffset = time * scrollSpeed;

        // Compute line center x at this y position
        float y = uv.y + yOffset;
        float lineX = scratchX + angle * (uv.y - 0.5) + sin(y * wobbleFreq * 6.2832 + wobblePhase) * wobbleAmp;

        // Distance from pixel to line in pixels
        float dist = abs(uv.x - lineX) * resolution.x;

        // Line thickness: 1-2 pixels
        float thickness = 0.8 + hash(seedBase + 2.2) * 0.7;
        float line = smoothstep(thickness, 0.0, dist);

        // Create breaks using noise
        float breakSeed = seedBase + 100.0;
        float breakVal = breakNoise(y * 3.0, 4.0 + hash(breakSeed) * 4.0, breakSeed);
        // Threshold: only show where noise > ~0.5, creating gaps
        float breakMask = smoothstep(0.35, 0.55, breakVal);

        // Brightness variation per scratch
        float brightness = 0.6 + hash(seedBase + 4.4) * 0.4;

        totalScratch += line * breakMask * brightness;
    }

    // Apply alpha and additive blend
    vec3 scratchColor = vec3(totalScratch * alpha);
    vec3 result = min(base.rgb + scratchColor, vec3(1.0));

    fragColor = vec4(result, base.a);
}
