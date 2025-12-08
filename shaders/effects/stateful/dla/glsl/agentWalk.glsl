#version 300 es

precision highp float;

uniform sampler2D agentTex;
uniform sampler2D gridTex;
uniform vec2 resolution;
uniform int frame;
uniform float padding;
uniform float density;
uniform float speed;
uniform float seedDensity;
uniform bool resetState;

layout(location = 0) out vec4 dlaOutColor;

float hash11(float v) {
    v = fract(v * 0.1031);
    v *= v + 33.33;
    v *= v + v;
    return fract(v);
}

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

float nextSeed(float seed) {
    return fract(seed * 43758.5453123 + 0.2137);
}

float rand(inout float seed) {
    seed = nextSeed(seed);
    return seed;
}

vec2 randomDirection(inout float seed) {
    float theta = rand(seed) * 6.28318530718;
    return vec2(cos(theta), sin(theta));
}

vec2 wrap01(vec2 v) {
    return fract(max(v, 0.0));
}

float sampleCluster(vec2 uv) {
    return texture(gridTex, wrap01(uv)).a;
}

float neighborhood(vec2 uv, float radius) {
    vec2 texel = radius * vec2(1.0 / resolution.x, 1.0 / resolution.y);
    float accum = 0.0;
    accum += sampleCluster(uv);
    accum += sampleCluster(uv + vec2(texel.x, 0.0));
    accum += sampleCluster(uv - vec2(texel.x, 0.0));
    accum += sampleCluster(uv + vec2(0.0, texel.y));
    accum += sampleCluster(uv - vec2(0.0, texel.y));
    return accum * 0.2;
}

vec2 spawnPosition(vec2 uv, inout float seed) {
    float rx = rand(seed);
    float ry = rand(seed);
    vec2 jitter = vec2(hash21(uv + seed), hash21(uv + seed * 1.7));
    return wrap01(vec2(rx, ry) + jitter * 0.15);
}

void main() {
    vec2 agentDims = vec2(textureSize(agentTex, 0));
    vec2 uv = (gl_FragCoord.xy - 0.5) / agentDims;

    vec4 prev = texture(agentTex, uv);
    vec2 pos = prev.xy;
    float seed = prev.z;
    float stuckPrev = prev.w;

    if (frame <= 1 || seed <= 0.0 || resetState) {
        seed = hash21(uv + float(frame) * 0.013) + 0.6180339887;
        pos = spawnPosition(uv, seed);
        stuckPrev = 0.0;
    }

    if (stuckPrev > 0.5) {
        seed = nextSeed(seed + hash11(dot(uv, vec2(17.0, 23.0))));
        pos = spawnPosition(uv + seed, seed);
        stuckPrev = 0.0;
    }

    float texel = 1.0 / max(resolution.x, resolution.y);
    float baseStep = max(padding, 1.0) * texel;
    float wander = mix(0.8, 2.5, clamp(density, 0.0, 1.0));
    wander += seedDensity * 6.0;
    float speedScale = clamp(speed, 0.25, 6.0);

    float local = neighborhood(pos, 4.0);
    float proximity = smoothstep(0.015, 0.12, local);

    vec2 stepDir = randomDirection(seed);
    float stepSize = mix(7.0, 1.25, proximity) * baseStep * speedScale;
    stepDir += randomDirection(seed) * (wander - 0.8) * baseStep * 0.25;

    vec2 candidate = wrap01(pos + stepDir * stepSize);
    float jitterStrength = 0.35 + seedDensity * 1.5;
    candidate += (rand(seed) - 0.5) * texel * jitterStrength * vec2(0.75, -0.65);
    candidate = wrap01(candidate);

    float neighbourhood = neighborhood(candidate, 2.0);
    float threshold = mix(0.06, 0.02, proximity);
    float stuck = neighbourhood > threshold ? 1.0 : 0.0;

    vec2 resultPos = candidate;

    dlaOutColor = vec4(resultPos, max(seed, 1e-4), stuck);
}
