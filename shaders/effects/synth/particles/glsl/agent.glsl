#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform sampler2D stateTex3;
uniform sampler2D inputTex;
uniform float gravity;
uniform float wind;
uniform float energy;
uniform float drag;
uniform float stride;
uniform float wander;
uniform float attrition;
uniform float density;
uniform float time;
uniform bool resetState;

layout(location = 0) out vec4 outState1;
layout(location = 1) out vec4 outState2;
layout(location = 2) out vec4 outState3;

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
    int width = int(resolution.x);
    int height = int(resolution.y);
    
    vec4 state1 = texelFetch(stateTex1, coord, 0);  // x, y, vx, vy
    vec4 state2 = texelFetch(stateTex2, coord, 0);  // r, g, b, seed
    vec4 state3 = texelFetch(stateTex3, coord, 0);  // age, energy, 0, 0
    
    float px = state1.x;
    float py = state1.y;
    float vx = state1.z;
    float vy = state1.w;
    float cr = state2.x;
    float cg = state2.y;
    float cb = state2.z;
    float seed_f = state2.w;
    float age = state3.x;
    float particleEnergy = state3.y;
    
    uint agentSeed = uint(coord.x + coord.y * width);
    int agentIndex = coord.x + coord.y * width;
    int totalAgents = width * height;
    int maxParticles = int(float(totalAgents) * density * 0.01);
    
    // Check if this particle is enabled
    bool isActive = agentIndex < maxParticles;
    
    // Check if needs initialization or reset
    if (state3.z < 0.5 || resetState) {
        // Initialize particle
        uint initSeed = agentSeed + uint(time * 1000.0);
        px = hash(initSeed) * resolution.x;
        py = hash(initSeed + 1u) * resolution.y;
        
        // Initial velocity with energy factor
        float angle = hash(initSeed + 2u) * 6.283185;
        float speed = hash(initSeed + 3u) * energy * 2.0;
        vx = cos(angle) * speed;
        vy = sin(angle) * speed;
        
        // Sample color from input texture
        vec2 sampleUV = vec2(px, py) / resolution;
        vec4 inputColor = texture(inputTex, sampleUV);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        seed_f = hash(initSeed + 4u);
        
        age = 0.0;
        particleEnergy = 1.0;
        
        outState1 = vec4(px, py, vx, vy);
        outState2 = vec4(cr, cg, cb, seed_f);
        outState3 = vec4(age, particleEnergy, 1.0, 0.0);  // z=1 marks initialized
        return;
    }
    
    if (!isActive) {
        outState1 = state1;
        outState2 = state2;
        outState3 = state3;
        return;
    }
    
    // Per-particle stride variation (0 = all same speed, 1 = highly varied)
    float strideMultiplier = 1.0 + (seed_f - 0.5) * stride * 2.0;
    
    // Smooth wander perturbation using noise field
    float noiseScale = 0.01;
    float wanderAngle = fbm(vec2(px, py) * noiseScale + time * 0.5) * 6.283185 * 2.0;
    float wanderStrength = wander * 0.5;
    float wanderX = cos(wanderAngle) * wanderStrength;
    float wanderY = sin(wanderAngle) * wanderStrength;
    
    // Apply physics forces
    float ax = wind + wanderX;
    float ay = -gravity + wanderY;  // Negate: positive gravity pulls down (decreasing Y in GL coords)
    
    // Update velocity with stride variation
    vx += ax * strideMultiplier;
    vy += ay * strideMultiplier;
    
    // Apply drag coefficient (0 = no drag, 0.2 = heavy drag)
    float dragFactor = 1.0 - drag;
    vx *= dragFactor;
    vy *= dragFactor;
    
    // Update position with stride
    px += vx * strideMultiplier;
    py += vy * strideMultiplier;
    
    // Age the particle
    age += attrition * 0.01;
    particleEnergy -= attrition * 0.005;
    
    // Check for respawn conditions
    bool needsRespawn = false;
    
    // Respawn if out of bounds
    if (px < 0.0 || px >= resolution.x || py < 0.0 || py >= resolution.y) {
        needsRespawn = true;
    }
    
    // Respawn if energy depleted
    if (particleEnergy <= 0.0) {
        needsRespawn = true;
    }
    
    if (needsRespawn) {
        uint respawnSeed = agentSeed + uint(time * 1000.0);
        px = hash(respawnSeed) * resolution.x;
        py = hash(respawnSeed + 1u) * resolution.y;
        
        float angle = hash(respawnSeed + 2u) * 6.283185;
        float speed = hash(respawnSeed + 3u) * energy * 2.0;
        vx = cos(angle) * speed;
        vy = sin(angle) * speed;
        
        // Sample new color
        vec2 sampleUV = vec2(px, py) / resolution;
        vec4 inputColor = texture(inputTex, sampleUV);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        
        age = 0.0;
        particleEnergy = 1.0;
    }
    
    outState1 = vec4(px, py, vx, vy);
    outState2 = vec4(cr, cg, cb, seed_f);
    outState3 = vec4(age, particleEnergy, 1.0, 0.0);
}
