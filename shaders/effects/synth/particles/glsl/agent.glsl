#version 300 es
precision highp float;
precision highp int;

// Standard uniforms
uniform vec2 resolution;
uniform float time;

// Physics parameters
uniform float gravity;
uniform float wind;
uniform float energy;
uniform float drag;
uniform float stride;
uniform float wander;
uniform float attrition;

// Input state from pipeline (from pointsEmitter)
uniform sampler2D inputTex; // Pipeline passthrough (for chainability)
uniform sampler2D xyzTex;   // [x, y, z, alive]
uniform sampler2D velTex;   // [vx, vy, vz, seed]
uniform sampler2D rgbaTex;  // [r, g, b, a]

// Output state (MRT)
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

// Smooth noise for wander perturbation
float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);  // Smoothstep
    
    uint n = uint(i.x) + uint(i.y) * 57u;
    float a = hash(n);
    float b = hash(n + 1u);
    float c = hash(n + 57u);
    float d = hash(n + 58u);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal noise for smoother motion
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
        v += a * noise2D(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 stateSize = textureSize(xyzTex, 0);
    
    // Read input state from pipeline
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    
    // Extract components
    float px = xyz.x;  // Position in normalized coords [0,1]
    float py = xyz.y;
    float pz = xyz.z;
    float alive = xyz.w;
    
    float vx = vel.x;
    float vy = vel.y;
    float vz = vel.z;
    float seed_f = vel.w;
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vel;
        outRGBA = rgba;
        return;
    }
    
    // Per-particle stride variation (0 = all same speed, 1 = highly varied)
    float strideMultiplier = 1.0 + (seed_f - 0.5) * stride * 2.0;
    
    // Smooth wander perturbation using noise field
    float noiseScale = 2.0;  // Adjust for normalized coords
    float wanderAngle = fbm(vec2(px, py) * noiseScale + time * 0.5) * 6.283185 * 2.0;
    float wanderStrength = wander * 0.002;  // Scaled for normalized coords
    float wanderX = cos(wanderAngle) * wanderStrength;
    float wanderY = sin(wanderAngle) * wanderStrength;
    
    // Physics forces (scaled for normalized coords)
    // Use energy as a global multiplier for visible movement
    float ax = (wind * 0.01 + wanderX) * energy;
    float ay = (-gravity * 0.01 + wanderY) * energy;  // Negate: positive gravity pulls down
    
    // Update velocity with stride variation
    vx += ax * strideMultiplier;
    vy += ay * strideMultiplier;
    
    // Apply drag coefficient (0 = no drag, 0.2 = heavy drag)
    float dragFactor = 1.0 - drag;
    vx *= dragFactor;
    vy *= dragFactor;
    
    // Update position (stride already factored into velocity)
    px += vx;
    py += vy;
    
    // Check for respawn conditions - set alive=0 to signal respawn
    bool needsRespawn = false;
    
    // Respawn if out of bounds (normalized coords)
    if (px < 0.0 || px > 1.0 || py < 0.0 || py > 1.0) {
        needsRespawn = true;
    }
    
    // Random attrition check (percentage of agents respawning per frame)
    if (attrition > 0.0) {
        uint agentSeed = uint(coord.x + coord.y * stateSize.x) + uint(time * 1000.0);
        float roll = hash(agentSeed);
        float attritionRate = attrition * 0.01;  // Convert 0-10% to 0-0.1
        if (roll < attritionRate) {
            needsRespawn = true;
        }
    }
    
    if (needsRespawn) {
        // Signal respawn by setting alive flag to 0
        // pointsEmitter will handle actual respawn on next frame
        outXYZ = vec4(px, py, pz, 0.0);
        outVel = vec4(vx, vy, vz, seed_f);
        outRGBA = rgba;
    } else {
        outXYZ = vec4(px, py, pz, 1.0);
        outVel = vec4(vx, vy, vz, seed_f);
        outRGBA = rgba;
    }
}
