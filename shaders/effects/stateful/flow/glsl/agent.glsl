#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform sampler2D stateTex3;
uniform sampler2D inputTex;
uniform float stride;
uniform float strideDeviation;
uniform float kink;
uniform float quantize;
uniform float time;
uniform float lifetime;
uniform float behavior;
uniform float density;
uniform bool resetState;

layout(location = 0) out vec4 outState1;
layout(location = 1) out vec4 outState2;
layout(location = 2) out vec4 outState3;

const float TAU = 6.283185307179586;
const float RIGHT_ANGLE = 1.5707963267948966;

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

float srgb_to_linear(float value) {
    if (value <= 0.04045) return value / 12.92;
    return pow((value + 0.055) / 1.055, 2.4);
}

float cube_root(float value) {
    if (value == 0.0) return 0.0;
    float sign_value = value >= 0.0 ? 1.0 : -1.0;
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

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

// Compute rotation bias based on behavior mode
// Called EVERY FRAME to allow behavior changes to take effect immediately
// baseRotRand is per-agent random [0,1] stored in state
float computeRotationBias(int behaviorMode, float baseHeading, float baseRotRand, float time, int agentIndex, int totalAgents) {
    if (behaviorMode <= 0) {
        // None: all face right (no rotation bias)
        return 0.0;
    } else if (behaviorMode == 1) {
        // Obedient: all same direction
        return baseHeading;
    } else if (behaviorMode == 2) {
        // Crosshatch: 4 cardinal directions based on per-agent random
        return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;
    } else if (behaviorMode == 3) {
        // Unruly: small deviation from base
        return baseHeading + (baseRotRand - 0.5) * 0.25;
    } else if (behaviorMode == 4) {
        // Chaotic: random direction
        return baseRotRand * TAU;
    } else if (behaviorMode == 5) {
        // Random Mix: divide agents into 4 quarters with different behaviors
        int quarterSize = max(1, totalAgents / 4);
        int band = agentIndex / quarterSize;
        if (band <= 0) {
            return baseHeading;  // Obedient
        } else if (band == 1) {
            return baseHeading + floor(baseRotRand * 4.0) * RIGHT_ANGLE;  // Crosshatch
        } else if (band == 2) {
            return baseHeading + (baseRotRand - 0.5) * 0.25;  // Unruly
        } else {
            return baseRotRand * TAU;  // Chaotic
        }
    } else if (behaviorMode == 10) {
        // Meandering: time-varying sine rotation using per-agent phase
        return normalized_sine((time - baseRotRand) * TAU);
    } else {
        return baseRotRand * TAU;
    }
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int width = int(resolution.x);
    int height = int(resolution.y);
    
    // Read current agent state
    vec4 state1 = texelFetch(stateTex1, coord, 0);  // x, y, rotRand, strideRand
    vec4 state2 = texelFetch(stateTex2, coord, 0);  // r, g, b, seed
    vec4 state3 = texelFetch(stateTex3, coord, 0);  // age, initialized, 0, 0
    
    float flow_x = state1.x;
    float flow_y = state1.y;
    float rotRand = state1.z;  // Per-agent random [0,1] for rotation variation
    float strideRand = state1.w;  // Per-agent random value [-0.5, 0.5] for stride variation
    float cr = state2.x;
    float cg = state2.y;
    float cb = state2.z;
    float seed_f = state2.w;
    float age = state3.x;
    float initialized = state3.y;
    
    uint agentSeed = uint(coord.x + coord.y * width);
    uint baseSeed = agentSeed + uint(time * 1000.0);
    
    // Compute total agent count for Random Mix behavior
    int totalAgents = width * height;  // Max possible agents (texture size)
    int agentIndex = coord.x + coord.y * width;
    
    // Check if this agent needs initialization or reset requested
    if (initialized < 0.5 || resetState) {
        // Initialize agent at random position
        vec2 pos = hash2(agentSeed);
        flow_x = pos.x * float(width);
        flow_y = pos.y * float(height);
        
        // Store per-agent random [0,1] for rotation variation
        // Actual rotation computed each frame based on current behavior uniform
        rotRand = hash(agentSeed + 200u);
        
        // Store per-agent random value for stride deviation
        // Actual deviation factor computed each frame using strideDeviation uniform
        strideRand = hash(agentSeed + 300u) - 0.5;  // Range [-0.5, 0.5]
        
        // Sample color from input
        int xi = wrap_int(int(flow_x), width);
        int yi = wrap_int(int(flow_y), height);
        vec4 inputColor = texelFetch(inputTex, ivec2(xi, yi), 0);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        seed_f = float(agentSeed);
        age = 0.0;
        initialized = 1.0;
    }
    
    // Check for respawn based on lifetime (literal seconds)
    // Each agent gets a staggered start based on index so they don't all respawn at once
    float agentPhase = float(agentIndex) / float(max(totalAgents, 1));
    float staggeredAge = age + agentPhase * lifetime;
    
    bool shouldRespawn = lifetime > 0.0 && staggeredAge >= lifetime;
    
    if (shouldRespawn) {
        // Respawn at new random location
        vec2 pos = hash2(baseSeed);
        flow_x = pos.x * float(width);
        flow_y = pos.y * float(height);
        
        // New random for rotation variation
        rotRand = hash(baseSeed + 200u);
        
        // Sample new color
        int xi = wrap_int(int(flow_x), width);
        int yi = wrap_int(int(flow_y), height);
        vec4 inputColor = texelFetch(inputTex, ivec2(xi, yi), 0);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        age = 0.0;
    }
    
    // Sample input texture at current position for flow direction
    int xi = wrap_int(int(flow_x), width);
    int yi = wrap_int(int(flow_y), height);
    vec4 texel = texelFetch(inputTex, ivec2(xi, yi), 0);
    float indexValue = oklab_l(texel.rgb);
    
    // Compute rotation bias based on behavior uniform (computed each frame!)
    // baseHeading is constant across all agents (seed 0)
    float baseHeading = hash(0u) * TAU;
    int behaviorMode = int(behavior);
    float rotationBias = computeRotationBias(behaviorMode, baseHeading, rotRand, time, agentIndex, totalAgents);
    
    // Final angle based on input texture and kink
    float finalAngle = indexValue * TAU * kink + rotationBias;
    
    if (quantize > 0.5) {
        finalAngle = round(finalAngle);
    }
    
    // Compute actual stride: uniform stride * resolution scale * per-agent deviation
    // strideRand is per-agent random [-0.5, 0.5], strideDeviation uniform controls magnitude
    float scale = max(float(max(width, height)) / 1024.0, 1.0);
    float devFactor = 1.0 + strideRand * 2.0 * strideDeviation;
    float actualStride = max(0.1, stride * scale * devFactor);
    
    // Move agent
    float newX = flow_x + sin(finalAngle) * actualStride;
    float newY = flow_y + cos(finalAngle) * actualStride;
    
    // Wrap position
    newX = wrap_float(newX, float(width));
    newY = wrap_float(newY, float(height));
    
    age += 0.016; // Approximate frame time
    
    // Output updated state
    outState1 = vec4(newX, newY, rotRand, strideRand);
    outState2 = vec4(cr, cg, cb, seed_f);
    outState3 = vec4(age, initialized, 0.0, 0.0);
}
