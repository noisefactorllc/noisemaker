#version 300 es
precision highp float;
precision highp int;

// Standard uniforms
uniform float time;
uniform vec2 resolution;
uniform float seed;

// Effect parameters
uniform int attractor;
uniform float speed;

// Input textures
uniform sampler2D xyzTex;
uniform sampler2D velTex;
uniform sampler2D rgbaTex;

// MRT outputs
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

// Lorenz attractor (classic butterfly)
vec3 lorenz(vec3 p) {
    float sigma = 10.0;
    float rho = 28.0;
    float beta = 8.0 / 3.0;
    return vec3(
        sigma * (p.y - p.x),
        p.x * (rho - p.z) - p.y,
        p.x * p.y - beta * p.z
    );
}

// Rössler attractor (spiral)
vec3 rossler(vec3 p) {
    float a = 0.2;
    float b = 0.2;
    float c = 5.7;
    return vec3(
        -p.y - p.z,
        p.x + a * p.y,
        b + p.z * (p.x - c)
    );
}

// Aizawa attractor (torus-like)
vec3 aizawa(vec3 p) {
    float a = 0.95;
    float b = 0.7;
    float c = 0.6;
    float d = 3.5;
    float e = 0.25;
    float f = 0.1;
    return vec3(
        (p.z - b) * p.x - d * p.y,
        d * p.x + (p.z - b) * p.y,
        c + a * p.z - (p.z * p.z * p.z) / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x
    );
}

// Thomas attractor (cyclically symmetric)
vec3 thomas(vec3 p) {
    float b = 0.208186;
    return vec3(
        sin(p.y) - b * p.x,
        sin(p.z) - b * p.y,
        sin(p.x) - b * p.z
    );
}

// Halvorsen attractor (3-fold symmetric)
vec3 halvorsen(vec3 p) {
    float a = 1.89;
    return vec3(
        -a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
        -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
        -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x
    );
}

// Chen attractor (double scroll)
vec3 chen(vec3 p) {
    float a = 40.0;
    float b = 3.0;
    float c = 28.0;
    return vec3(
        a * (p.y - p.x),
        (c - a) * p.x - p.x * p.z + c * p.y,
        p.x * p.y - b * p.z
    );
}

// Dadras attractor (4-wing)
vec3 dadras(vec3 p) {
    float a = 3.0;
    float b = 2.7;
    float c = 1.7;
    float d = 2.0;
    float e = 9.0;
    return vec3(
        p.y - a * p.x + b * p.y * p.z,
        c * p.y - p.x * p.z + p.z,
        d * p.x * p.y - e * p.z
    );
}

vec3 stepAttractor(vec3 p, int type, float dt) {
    vec3 dp;
    if (type == 0) dp = lorenz(p);
    else if (type == 1) dp = rossler(p);
    else if (type == 2) dp = aizawa(p);
    else if (type == 3) dp = thomas(p);
    else if (type == 4) dp = halvorsen(p);
    else if (type == 5) dp = chen(p);
    else dp = dadras(p);
    
    return p + dp * dt;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 texSize = textureSize(xyzTex, 0);
    int stateSize = texSize.x;
    
    // Read current state
    vec4 pos = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 col = texelFetch(rgbaTex, coord, 0);
    
    uint agentSeed = uint(coord.x + coord.y * stateSize) + uint(seed);
    
    // Check if needs 3D initialization (pos.w == 1 but xyz near origin means not initialized for 3D)
    // pointsEmitter initializes in 2D (0-1 range), we need to transform to attractor space
    bool needs3DInit = pos.w >= 0.5 && abs(pos.x) < 2.0 && abs(pos.y) < 2.0 && abs(pos.z) < 2.0;
    
    if (needs3DInit) {
        // Transform from 2D normalized coords to attractor space
        // Lorenz-like attractors need roughly ±20 x/y and 10-40 z
        uint initSeed = agentSeed + uint(time * 1000.0);
        pos.x = (hash(initSeed) - 0.5) * 20.0;
        pos.y = (hash(initSeed + 1u) - 0.5) * 20.0;
        pos.z = hash(initSeed + 2u) * 30.0 + 10.0;
        
        outXYZ = vec4(pos.xyz, 1.0);
        outVel = vel;
        outRGBA = col;
        return;
    }
    
    // Skip dead agents
    if (pos.w < 0.5) {
        outXYZ = pos;
        outVel = vel;
        outRGBA = col;
        return;
    }
    
    // Step the attractor
    float dt = speed * 0.01;
    vec3 newPos = stepAttractor(pos.xyz, attractor, dt);
    
    // Check for divergence (NaN or too far)
    if (any(isnan(newPos)) || length(newPos) > 1000.0) {
        // Reinitialize in attractor space
        uint respawnSeed = agentSeed + uint(time * 1000.0);
        newPos.x = (hash(respawnSeed) - 0.5) * 20.0;
        newPos.y = (hash(respawnSeed + 1u) - 0.5) * 20.0;
        newPos.z = hash(respawnSeed + 2u) * 30.0 + 10.0;
    }
    
    outXYZ = vec4(newPos, 1.0);
    outVel = vel;
    outRGBA = col;
}
