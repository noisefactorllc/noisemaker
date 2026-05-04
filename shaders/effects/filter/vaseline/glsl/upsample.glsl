#version 300 es
precision highp float;

// Vaseline - N-tap blur with edge-weighted blending
// Uses golden angle spiral kernel for smooth, non-blocky blur

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float renderScale;
uniform float alpha;

out vec4 fragColor;

const int TAP_COUNT = 32;
const float RADIUS = 48.0;
const float GOLDEN_ANGLE = 2.39996323;
const float BRIGHTNESS_ADJUST = 0.15;

vec3 clamp01(vec3 v) {
    return clamp(v, vec3(0.0), vec3(1.0));
}

float chebyshev_mask(vec2 uv) {
    vec2 centered = abs(uv - vec2(0.5)) * 2.0;
    return max(centered.x, centered.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / fullRes;
    vec4 original = texelFetch(inputTex, ivec2(gl_FragCoord.xy), 0);
    float a = clamp(alpha, 0.0, 1.0);

    if (a <= 0.0) {
        fragColor = vec4(clamp01(original.rgb), original.a);
        return;
    }

    vec2 texelSize = 1.0 / resolution;
    vec2 radiusUV = RADIUS * renderScale * texelSize;

    // N-tap gather using golden angle spiral (Poisson-like distribution)
    vec3 blurAccum = vec3(0.0);
    float weightSum = 0.0;

    for (int i = 0; i < TAP_COUNT; i++) {
        float t = float(i) / float(TAP_COUNT);
        float r = sqrt(t);
        float theta = float(i) * GOLDEN_ANGLE;
        vec2 offset = vec2(cos(theta), sin(theta)) * r;

        float sigma = 0.4;
        float weight = exp(-0.5 * (r * r) / (sigma * sigma));

        vec2 sampleUV = clamp(uv + offset * radiusUV, vec2(0.0), vec2(1.0));
        blurAccum += texture(inputTex, sampleUV).rgb * weight;
        weightSum += weight;
    }

    vec3 blurred = blurAccum / weightSum;
    vec3 boosted = clamp01(blurred + vec3(BRIGHTNESS_ADJUST));

    // Edge mask - more effect at edges, using global UV so center is full-image center
    float edgeMask = chebyshev_mask(globalUV);
    edgeMask = smoothstep(0.0, 0.8, edgeMask);

    vec3 sourceClamped = clamp01(original.rgb);
    vec3 bloomed = clamp01((sourceClamped + boosted) * 0.5);
    vec3 edgeBlended = mix(sourceClamped, bloomed, edgeMask);
    vec3 finalRgb = clamp01(mix(sourceClamped, edgeBlended, a));

    fragColor = vec4(finalRgb, original.a);
}
