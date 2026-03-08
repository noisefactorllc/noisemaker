#version 300 es

precision highp float;
precision highp int;

// Reverb effect: blend input with multiple scaled-down versions of itself.
// Iterations control how many octaves of scaling are blended.

uniform sampler2D inputTex;
uniform int iterations;
uniform bool ridges;
uniform float alpha;

out vec4 fragColor;

vec4 ridge_transform(vec4 color) {
    return vec4(1.0) - abs(color * 2.0 - vec4(1.0));
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(dims);

    // Save original input for alpha blending
    vec4 original = texture(inputTex, uv);

    // Sample at current position
    vec4 current = original;

    // Apply ridge transform if enabled
    if (ridges) {
        current = ridge_transform(current);
    }

    // Accumulate multiple scaled samples based on iterations
    vec4 accum = current;
    float totalWeight = 1.0;
    float weight = 0.5;
    float scale = 2.0;

    int iters = clamp(iterations, 1, 8);
    for (int i = 0; i < iters; i++) {
        vec2 scaledUV = fract(uv * scale);
        vec4 scaled = texture(inputTex, scaledUV);

        if (ridges) {
            scaled = ridge_transform(scaled);
        }

        accum += scaled * weight;
        totalWeight += weight;

        scale *= 2.0;
        weight *= 0.5;
    }

    vec4 result = accum / totalWeight;

    fragColor = vec4(mix(original.rgb, result.rgb, alpha), 1.0);
}
