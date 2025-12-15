#version 300 es
precision highp float;
precision highp int;
/*
 * Flow3D agent pass - Direct and faithful port of nu/flow agent.glsl to 3D
 * 
 * Agent format (matching 2D flow):
 * - state1: [x, y, z, rotRand]        - 3D position + per-agent rotation random
 * - state2: [r, g, b, seed]           - color + seed
 * - state3: [age, initialized, strideRand, 0] - age, init flag, per-agent stride random
 */

uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform sampler2D stateTex3;
uniform sampler2D mixerTex;
uniform float stride;
uniform float strideDeviation;
uniform float kink;
uniform float time;
uniform float lifetime;
uniform float behavior;
uniform float density;
uniform int volumeSize;

layout(location = 0) out vec4 outState1;
layout(location = 1) out vec4 outState2;
layout(location = 2) out vec4 outState3;

const float TAU = 6.283185307179586;
const float PI = 3.141592653589793;
const float RIGHT_ANGLE = 1.5707963267948966;

uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

vec3 hash3(uint seed) {
    return vec3(hash(seed), hash(seed + 1u), hash(seed + 2u));
}

float wrap_float(float value, float size) {
    if (size <= 0.0) return 0.0;
    float scaled = floor(value / size);
    float wrapped = value - scaled * size;
    if (wrapped < 0.0) wrapped += size;
    return wrapped;
}

int wrap_int(int value, int size) {
    if (size <= 0) return 0;
    int result = value % size;
    if (result < 0) result += size;
    return result;
}

// Convert 3D voxel coord to 2D atlas texel coord
ivec2 atlasTexel(ivec3 p, int volSize) {
    ivec3 clamped = clamp(p, ivec3(0), ivec3(volSize - 1));
    return ivec2(clamped.x, clamped.y + clamped.z * volSize);
}

// Sample 3D volume at integer voxel position (matching 2D texelFetch pattern)
vec4 sampleVoxel(ivec3 voxel, int volSize) {
    ivec3 clamped = clamp(voxel, ivec3(0), ivec3(volSize - 1));
    return texelFetch(mixerTex, atlasTexel(clamped, volSize), 0);
}

// sRGB to linear conversion
float srgb_to_linear(float value) {
    if (value <= 0.04045) return value / 12.92;
    return pow((value + 0.055) / 1.055, 2.4);
}

float cube_root(float value) {
    if (value == 0.0) return 0.0;
    float sign_value = value >= 0.0 ? 1.0 : -1.0;
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

// OKLab L (luminance) from RGB - exact match from 2D flow
float oklab_l(vec3 rgb) {
    float r_lin = srgb_to_linear(clamp(rgb.x, 0.0, 1.0));
    float g_lin = srgb_to_linear(clamp(rgb.y, 0.0, 1.0));
    float b_lin = srgb_to_linear(clamp(rgb.z, 0.0, 1.0));
    float l = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    float m = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    float s = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;
    return 0.2104542553 * cube_root(l) + 0.7936177850 * cube_root(m) - 0.0040720468 * cube_root(s);
}

float normalized_sine(float value) {
    return (sin(value) + 1.0) * 0.5;
}

// Compute rotation bias based on behavior mode - direct port from 2D flow
// For 3D, we use this for azimuthal angle, same logic as 2D
float computeRotationBias(int behaviorMode, float baseHeading, float baseRotRand, float time, int agentIndex, int totalAgents) {
    if (behaviorMode <= 0) {
        return 0.0;
    } else if (behaviorMode == 1) {
        // Obedient: all same direction
        return baseHeading;
    } else if (behaviorMode == 2) {
        // Crosshatch: 4 cardinal directions (same as 2D)
        return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;
    } else if (behaviorMode == 3) {
        // Unruly: small deviation from base
        return baseHeading + (baseRotRand - 0.5) * 0.25;
    } else if (behaviorMode == 4) {
        // Chaotic: random direction
        return baseRotRand * TAU;
    } else if (behaviorMode == 5) {
        // Random Mix: divide agents into 4 quarters
        int quarterSize = max(1, totalAgents / 4);
        int band = agentIndex / quarterSize;
        if (band <= 0) {
            return baseHeading;
        } else if (band == 1) {
            return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;
        } else if (band == 2) {
            return baseHeading + (baseRotRand - 0.5) * 0.25;
        } else {
            return baseRotRand * TAU;
        }
    } else if (behaviorMode == 10) {
        // Meandering
        return normalized_sine((time - baseRotRand) * TAU);
    } else {
        return baseRotRand * TAU;
    }
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    // Use actual state texture size, not canvas resolution
    ivec2 stateTexSize = textureSize(stateTex1, 0);
    int width = stateTexSize.x;
    int height = stateTexSize.y;
    
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    // Read current agent state
    vec4 state1 = texelFetch(stateTex1, coord, 0);  // x, y, z, rotRand
    vec4 state2 = texelFetch(stateTex2, coord, 0);  // r, g, b, seed
    vec4 state3 = texelFetch(stateTex3, coord, 0);  // age, initialized, strideRand, 0
    
    float flow_x = state1.x;
    float flow_y = state1.y;
    float flow_z = state1.z;
    float rotRand = state1.w;  // Per-agent random [0,1] for rotation variation
    float cr = state2.x;
    float cg = state2.y;
    float cb = state2.z;
    float seed_f = state2.w;
    float age = state3.x;
    float initialized = state3.y;
    float strideRand = state3.z;  // Per-agent random [-0.5, 0.5] for stride variation
    
    uint agentSeed = uint(coord.x + coord.y * width);
    uint baseSeed = agentSeed + uint(time * 1000.0);
    
    int totalAgents = width * height;
    int agentIndex = coord.x + coord.y * width;
    
    // Check if this agent needs initialization
    if (initialized < 0.5) {
        // Initialize agent at random 3D position within volume
        vec3 pos = hash3(agentSeed);
        flow_x = pos.x * volSizeF;
        flow_y = pos.y * volSizeF;
        flow_z = pos.z * volSizeF;
        
        // Store per-agent random [0,1] for rotation variation
        rotRand = hash(agentSeed + 200u);
        
        // Store per-agent random value for stride deviation
        strideRand = hash(agentSeed + 300u) - 0.5;  // Range [-0.5, 0.5]
        
        // Sample color from input 3D volume
        int xi = wrap_int(int(flow_x), volSize);
        int yi = wrap_int(int(flow_y), volSize);
        int zi = wrap_int(int(flow_z), volSize);
        vec4 inputColor = sampleVoxel(ivec3(xi, yi, zi), volSize);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        seed_f = float(agentSeed);
        age = 0.0;
        initialized = 1.0;
    }
    
    // Check for respawn based on lifetime
    float agentPhase = float(agentIndex) / float(max(totalAgents, 1));
    float staggeredAge = age + agentPhase * lifetime;
    
    bool shouldRespawn = lifetime > 0.0 && staggeredAge >= lifetime;
    
    if (shouldRespawn) {
        // Respawn at new random location
        vec3 pos = hash3(baseSeed);
        flow_x = pos.x * volSizeF;
        flow_y = pos.y * volSizeF;
        flow_z = pos.z * volSizeF;
        
        // New random for rotation variation
        rotRand = hash(baseSeed + 200u);
        
        // Sample new color from input 3D volume
        int xi = wrap_int(int(flow_x), volSize);
        int yi = wrap_int(int(flow_y), volSize);
        int zi = wrap_int(int(flow_z), volSize);
        vec4 inputColor = sampleVoxel(ivec3(xi, yi, zi), volSize);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        age = 0.0;
    }
    
    // Sample input texture at current position for flow direction
    // This is THE KEY: luminance of input determines agent direction
    int xi = wrap_int(int(flow_x), volSize);
    int yi = wrap_int(int(flow_y), volSize);
    int zi = wrap_int(int(flow_z), volSize);
    vec4 texel = sampleVoxel(ivec3(xi, yi, zi), volSize);
    float indexValue = oklab_l(texel.rgb);
    
    // Compute rotation bias based on behavior uniform
    float baseHeading = hash(0u) * TAU;
    int behaviorMode = int(behavior);
    float rotationBias = computeRotationBias(behaviorMode, baseHeading, rotRand, time, agentIndex, totalAgents);
    
    // For 3D: azimuth angle (XY plane) - direct extension of 2D angle
    float azimuth = indexValue * TAU * kink + rotationBias;
    
    // Elevation: use indexValue to modulate vertical movement
    // This extends the 2D angle concept to 3D
    float elevation = (indexValue - 0.5) * PI * kink * 0.5;
    
    // Compute stride with deviation (exact match to 2D flow)
    float scale = max(volSizeF / 64.0, 1.0);
    float devFactor = 1.0 + strideRand * 2.0 * strideDeviation;
    float actualStride = max(0.1, stride * scale * devFactor);
    
    // Move agent in 3D (extending 2D sin/cos to include Z)
    float cosElev = cos(elevation);
    float newX = flow_x + sin(azimuth) * cosElev * actualStride;
    float newY = flow_y + cos(azimuth) * cosElev * actualStride;
    float newZ = flow_z + sin(elevation) * actualStride;
    
    // Wrap position within volume
    newX = wrap_float(newX, volSizeF);
    newY = wrap_float(newY, volSizeF);
    newZ = wrap_float(newZ, volSizeF);
    
    age += 0.016;  // Approximate frame time
    
    // Output updated state
    outState1 = vec4(newX, newY, newZ, rotRand);
    outState2 = vec4(cr, cg, cb, seed_f);
    outState3 = vec4(age, initialized, strideRand, 0.0);
}
