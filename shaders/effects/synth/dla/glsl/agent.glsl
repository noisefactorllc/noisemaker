#version 300 es
precision highp float;
precision highp int;

// Standard uniforms
uniform vec2 resolution;
uniform float time;
uniform int frame;

// DLA parameters
uniform float stride;
uniform float inputWeight;
uniform float attrition;
uniform int stateSize;
uniform bool resetState;

// Input state from pipeline (from pointsEmitter)
uniform sampler2D xyzTex;    // [x, y, z, alive]
uniform sampler2D velTex;    // [seed, justStuck, 0, agentRand]
uniform sampler2D rgbaTex;   // [r, g, b, a]

// DLA internal textures
uniform sampler2D gridTex;   // Anchor grid (internal, not rendered)
uniform sampler2D inputTex;  // For input-weighted movement

// Output state (MRT)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

// Integer-based hash for deterministic randomness
uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

// PCG-style random using float seed (stored as bits)
float rand(inout float seed) {
    uint bits = floatBitsToUint(seed);
    bits = hash_uint(bits);
    seed = uintBitsToFloat(bits | 0x3F800000u) - 1.0; // Map to [0,1)
    // Ensure we get a different value next time
    bits = hash_uint(bits + 1u);
    seed = uintBitsToFloat((bits & 0x007FFFFFu) | 0x3F800000u) - 1.0;
    return seed;
}

vec2 randomDirection(inout float seed) {
    float theta = rand(seed) * 6.28318530718;
    return vec2(cos(theta), sin(theta));
}

vec2 wrap01(vec2 v) {
    return fract(max(v, 0.0));
}

float sampleGrid(vec2 uv) {
    ivec2 dims = textureSize(gridTex, 0);
    ivec2 coord = ivec2(wrap01(uv) * vec2(dims));
    return texelFetch(gridTex, coord, 0).a;
}

float neighborhood(vec2 uv, float radius) {
    vec2 gridDims = vec2(textureSize(gridTex, 0));
    vec2 texel = radius / gridDims;
    float accum = 0.0;
    accum += sampleGrid(uv);
    accum += sampleGrid(uv + vec2(texel.x, 0.0));
    accum += sampleGrid(uv - vec2(texel.x, 0.0));
    accum += sampleGrid(uv + vec2(0.0, texel.y));
    accum += sampleGrid(uv - vec2(0.0, texel.y));
    return accum * 0.2;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 stateDims = textureSize(xyzTex, 0);
    
    // Read input state from pipeline (from pointsEmitter)
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    
    // Extract state
    vec2 pos = xyz.xy;
    float alive = xyz.w;
    
    // vel.x = seed for randomness (initialized from agentRand if needed)
    // vel.y = justStuck flag (1.0 if this agent just stuck, used by depositGrid)
    // vel.w = agentRand from pointsEmitter
    float seed = vel.x;
    float agentRand = vel.w;
    
    // Initialize or evolve seed - include frame to ensure different random each frame
    uint agentId = uint(coord.x + coord.y * stateDims.x);
    if (seed <= 0.0 || frame <= 1) {
        seed = hash(agentId + uint(time * 1000.0)) + 0.001;
    }
    // Mix in frame number to ensure different random direction each frame
    uint frameSeed = hash_uint(agentId * 31u + uint(frame));
    seed = uintBitsToFloat((frameSeed & 0x007FFFFFu) | 0x3F800000u) - 1.0;
    
    // If not alive, pass through (waiting for respawn from pointsEmitter)
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vec4(seed, 0.0, 0.0, agentRand);
        outRGBA = rgba;
        return;
    }
    
    // Grid dimensions for step size
    vec2 gridDims = vec2(textureSize(gridTex, 0));
    float texel = 1.0 / max(gridDims.x, gridDims.y);
    
    // Check proximity to existing structure
    float local = neighborhood(pos, 2.0);
    float proximity = smoothstep(0.015, 0.12, local);
    
    // Random direction for walk
    vec2 randomDir = randomDirection(seed);
    
    // Input-weighted direction
    float inputW = inputWeight / 100.0;
    vec2 stepDir = randomDir;
    if (inputW > 0.0) {
        ivec2 inputDims = textureSize(inputTex, 0);
        ivec2 inputCoord = ivec2(wrap01(pos) * vec2(inputDims));
        vec4 inputVal = texelFetch(inputTex, inputCoord, 0);
        vec2 inputDir = inputVal.xy * 2.0 - 1.0;
        if (length(inputDir) > 0.01) {
            inputDir = normalize(inputDir);
            stepDir = normalize(mix(randomDir, inputDir, inputW));
        }
    }
    
    // Step size: slow down near structure for finer aggregation
    float stepSize = (stride / 10.0) * texel * mix(3.0, 0.5, proximity);
    
    // Add wander jitter
    stepDir += randomDirection(seed) * 0.3;
    stepDir = normalize(stepDir);
    
    // Move agent
    vec2 candidate = wrap01(pos + stepDir * stepSize);
    
    // Check for sticking - require direct adjacency (radius 1.0)
    float here = sampleGrid(candidate);
    float nearby = neighborhood(candidate, 1.0);
    
    // Stick if adjacent to structure but local spot is empty
    bool stuck = (nearby > 0.3 && here < 0.5);
    
    // Attrition: random respawn (0-10 scale → 0-0.1)
    bool needsRespawn = false;
    if (attrition > 0.0) {
        float attritionRate = attrition * 0.01;
        if (rand(seed) < attritionRate) {
            needsRespawn = true;
        }
    }
    
    if (stuck) {
        // Agent stuck: mark as dead for respawn, flag justStuck for deposit
        outXYZ = vec4(candidate, 0.0, 0.0);  // w=0 signals death to pointsEmitter
        outVel = vec4(seed, 1.0, 0.0, agentRand);  // y=1 signals "just stuck" for depositGrid
        outRGBA = rgba;
    } else if (needsRespawn) {
        // Attrition death: mark for respawn
        outXYZ = vec4(candidate, 0.0, 0.0);  // w=0 signals death
        outVel = vec4(seed, 0.0, 0.0, agentRand);  // y=0, not stuck
        outRGBA = rgba;
    } else {
        // Continue walking
        outXYZ = vec4(candidate, 0.0, 1.0);  // w=1 alive
        outVel = vec4(seed, 0.0, 0.0, agentRand);
        outRGBA = rgba;
    }
}
