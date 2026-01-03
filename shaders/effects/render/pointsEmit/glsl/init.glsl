#version 300 es
precision highp float;

// Standard uniforms
uniform float time;
uniform vec2 resolution;
uniform int seed;

// Effect parameters
uniform int stateSize;
uniform int layoutMode; // 0=Random, 1=Grid, 2=Center, 3=Ring
uniform float attrition; // Per-frame respawn chance (0-10%)
uniform bool resetState; // Force all agents to respawn

// Inputs
uniform sampler2D xyzTex;
uniform sampler2D velTex;
uniform sampler2D rgbaTex;
uniform sampler2D inputTex;  // Chained input for coloring agents

// Outputs (MRT)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

// Integer-based hash for cross-platform determinism
uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

vec2 hash2(uint seed) {
    return vec2(hash(seed), hash(seed + 1u));
}

void main() {
    // Current coordinate in state texture
    ivec2 stateCoord = ivec2(gl_FragCoord.xy);
    vec2 uv = gl_FragCoord.xy / float(stateSize);
    
    // Agent seed for random generation - compute early for attrition check
    uint agentSeed = uint(stateCoord.x + stateCoord.y * stateSize) + uint(seed);
    
    // Read previous state using texelFetch for pixel parity with WGSL
    vec4 pPos = texelFetch(xyzTex, stateCoord, 0);
    vec4 pVel = texelFetch(velTex, stateCoord, 0);
    vec4 pCol = texelFetch(rgbaTex, stateCoord, 0);
    
    // Check if agent needs respawn
    // w component of xyz holds the "alive" flag
    // < 0.5 means dead/uninitialized
    // We also respawn on the very first frame (time == 0) or if alpha is 0
    // resetState forces all agents to respawn
    bool needsRespawn = resetState || (pPos.w < 0.5) || (time < 0.01 && pPos.w == 0.0);
    
    // Attrition: per-frame random respawn chance
    // Use continuous time mixed with agent seed to decorrelate respawns
    if (!needsRespawn && attrition > 0.0) {
        // Mix time continuously into hash to avoid burst patterns
        // floatBitsToUint gives us full precision of time value
        uint timeBits = floatBitsToUint(time);
        uint check_seed = agentSeed * 1664525u + timeBits;
        check_seed = hash_uint(check_seed); // Extra mixing
        float respawnRand = float(check_seed) / 4294967295.0;
        float attritionRate = attrition * 0.01; // 0-10% per frame
        if (respawnRand < attritionRate) {
            needsRespawn = true;
        }
    }
    
    // Compute spawn values unconditionally (no branching in texture access)
    // Use integer-based hash for cross-platform determinism
    vec2 rnd = hash2(agentSeed);
    
    // Compute position based on layout mode
    vec3 newPos = vec3(0.0);
    if (layoutMode == 0) { // Random
        newPos = vec3(rnd, 0.0);
    } else if (layoutMode == 1) { // Grid
        newPos = vec3(uv, 0.0);
    } else if (layoutMode == 2) { // Center
        newPos = vec3(0.5 + (rnd - 0.5) * 0.1, 0.0);
    } else if (layoutMode == 3) { // Ring
        float angle = rnd.x * 6.28318;
        float radius = 0.3 + rnd.y * 0.1;
        newPos = vec3(0.5 + vec2(cos(angle), sin(angle)) * radius, 0.0);
    } else if (layoutMode == 4) { // Clusters
        // 5 random cluster centers based on seed
        uint clusterSeed = uint(seed) * 12345u;
        float clusterId = floor(rnd.x * 5.0);
        uint centerSeed = clusterSeed + uint(clusterId) * 31u;
        vec2 center = vec2(hash(centerSeed), hash(centerSeed + 17u));
        // Agents spread around center with ~15% radius
        float r = hash(agentSeed + 2u) * 0.15;
        float a = hash(agentSeed + 3u) * 6.28318;
        newPos = vec3(center + vec2(cos(a), sin(a)) * r, 0.0);
        // Wrap to [0,1]
        newPos.xy = fract(newPos.xy);
    } else if (layoutMode == 5) { // Spiral
        // Archimedean spiral from center
        float t = rnd.x * 20.0;
        float r = t * 0.02;  // Spiral expands slowly
        float a = t * 6.28318;
        newPos = vec3(0.5 + vec2(cos(a), sin(a)) * r, 0.0);
        // Clamp to valid range
        newPos.xy = clamp(newPos.xy, 0.0, 1.0);
    }
    
    // Sample color from inputTex - use texelFetch to avoid uniform control flow issue
    ivec2 texDims = textureSize(inputTex, 0);
    ivec2 texCoord = ivec2(newPos.xy * vec2(texDims));
    vec4 sampledCol = texelFetch(inputTex, texCoord, 0);
    // Use sampled color if texture has content (alpha > 0), otherwise white
    vec4 newCol = (sampledCol.a > 0.0) ? sampledCol : vec4(1.0);
    
    // Select between spawned values and previous state
    if (needsRespawn) {
        // Store per-agent randoms in vel for downstream effects:
        // vel.z = rotRand [0,1] for rotation variation (flow behavior)
        // vel.w = strideRand [-0.5,0.5] for stride variation
        float rotRand = hash(agentSeed + 100u);
        float strideRand = hash(agentSeed + 101u) - 0.5;
        outXYZ = vec4(newPos, 1.0);
        outVel = vec4(0.0, 0.0, rotRand, strideRand);
        outRGBA = newCol;
    } else {
        outXYZ = pPos;
        outVel = pVel;
        outRGBA = pCol;
    }
}
