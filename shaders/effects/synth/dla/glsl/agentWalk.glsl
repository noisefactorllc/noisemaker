#version 300 es

precision highp float;

uniform sampler2D agentTex;
uniform sampler2D colorTex;
uniform sampler2D gridTex;
uniform sampler2D tex;
uniform int frame;
uniform float inputWeight;
uniform int colorMode;  // 0 = mono (white), 1 = sample from tex
uniform float attrition;
uniform float stride;
uniform float density;
uniform bool resetState;

layout(location = 0) out vec4 outState;
layout(location = 1) out vec4 outColor;

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
    vec2 gridDims = vec2(textureSize(gridTex, 0));
    vec2 texel = radius / gridDims;
    float accum = 0.0;
    accum += sampleCluster(uv);
    accum += sampleCluster(uv + vec2(texel.x, 0.0));
    accum += sampleCluster(uv - vec2(texel.x, 0.0));
    accum += sampleCluster(uv + vec2(0.0, texel.y));
    accum += sampleCluster(uv - vec2(0.0, texel.y));
    return accum * 0.2;
}

vec2 spawnPosition(vec2 uv, inout float seed, sampler2D grid) {
    // Try to find a spawn position away from existing structure
    // Use threshold of 0.05 (half the sticking threshold) to spawn safely away
    for (int attempt = 0; attempt < 8; attempt++) {
        float rx = rand(seed);
        float ry = rand(seed);
        vec2 jitter = vec2(hash21(uv + seed), hash21(uv + seed * 1.7));
        vec2 candidate = wrap01(vec2(rx, ry) + jitter * 0.15);
        
        // Check if this spot is clear of structure
        float nearby = texture(grid, candidate).a;
        if (nearby < 0.05) {
            return candidate;
        }
        seed = nextSeed(seed);
    }
    // Fallback: return last attempt anyway
    float rx = rand(seed);
    float ry = rand(seed);
    return wrap01(vec2(rx, ry));
}

void main() {
    vec2 agentDims = vec2(textureSize(agentTex, 0));
    vec2 uv = (gl_FragCoord.xy - 0.5) / agentDims;

    // Density check: if agent index is above density threshold, kill it
    float densityNorm = density / 100.0;
    float agentId = hash21(uv * 123.45); 
    if (agentId > densityNorm) {
        outState = vec4(0.0); 
        outColor = vec4(0.0);
        return;
    }

    vec4 prev = texture(agentTex, uv);
    vec4 prevColor = texture(colorTex, uv);
    vec2 pos = prev.xy;
    float seed = prev.z;
    float stuckPrev = prev.w;
    vec3 agentColor = prevColor.rgb;

    bool respawn = false;
    if (frame <= 1 || seed <= 0.0 || resetState) respawn = true;
    if (stuckPrev > 0.5) respawn = true;
    
    // Attrition: random death (0-10% → 0-0.1)
    float attritionNorm = attrition / 100.0;
    if (rand(seed) < attritionNorm) respawn = true;

    bool justSpawned = respawn;
    if (respawn) {
        seed = hash21(uv + float(frame) * 0.013) + 0.6180339887;
        pos = spawnPosition(uv, seed, gridTex);
        stuckPrev = 0.0;
        
        // Sample color from input at spawn position
        if (colorMode == 0) {
            // Mono mode - use white
            agentColor = vec3(1.0);
        } else {
            vec2 texDims = vec2(textureSize(tex, 0));
            ivec2 texCoord = ivec2(pos * texDims);
            vec4 inputColor = texelFetch(tex, texCoord, 0);
            agentColor = inputColor.rgb;
        }
    }

    vec2 gridDims = vec2(textureSize(gridTex, 0));
    float texel = 1.0 / max(gridDims.x, gridDims.y);
    
    // Stride controls step size (10 = 1 pixel roughly)
    float baseStep = (stride / 10.0) * texel;

    float local = neighborhood(pos, 4.0);
    float proximity = smoothstep(0.015, 0.12, local);

    // Direction
    vec2 randomDir = randomDirection(seed);
    
    // Input influence
    float inputW = inputWeight / 100.0;
    vec2 inputDir = vec2(0.0);
    if (inputW > 0.0) {
        vec4 inputVal = texture(tex, pos);
        // Assume input is flow-like (0.5 centered)
        inputDir = inputVal.xy * 2.0 - 1.0;
        if (length(inputDir) < 0.01) inputDir = randomDir;
        else inputDir = normalize(inputDir);
    }
    
    vec2 stepDir = normalize(mix(randomDir, inputDir, inputW));

    // Step size directly from stride (stride=10 means 1 pixel)
    // Slow down near structure for finer aggregation
    float stepSize = (stride / 10.0) * texel * mix(3.0, 0.5, proximity);
    
    // Add some wander/jitter
    stepDir += randomDirection(seed) * 0.3;
    stepDir = normalize(stepDir);

    vec2 candidate = wrap01(pos + stepDir * stepSize);
    
    // Check for sticking - need nearby structure but empty local spot
    // Use higher threshold (0.1) so agents only stick near actual cluster, not diffused trail
    float here = sampleCluster(candidate);
    float nearby = neighborhood(candidate, 3.0);
    float stuck = 0.0;
    if (!justSpawned && nearby > 0.1 && here < 0.5) {
        stuck = 1.0;
    }

    outState = vec4(candidate, max(seed, 1e-4), stuck);
    outColor = vec4(agentColor, 1.0);
}
