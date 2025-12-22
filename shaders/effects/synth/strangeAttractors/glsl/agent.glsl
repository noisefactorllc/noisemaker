#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform sampler2D stateTex1;
uniform sampler2D stateTex2;
uniform sampler2D tex;
uniform int attractor;
uniform float density;
uniform float speed;
uniform float scale;
uniform float time;
uniform bool resetState;

layout(location = 0) out vec4 outState1;  // x, y, z, w (unused)
layout(location = 1) out vec4 outState2;  // r, g, b, seed

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
    int width = int(resolution.x);
    int height = int(resolution.y);
    
    vec4 state1 = texelFetch(stateTex1, coord, 0);
    vec4 state2 = texelFetch(stateTex2, coord, 0);
    
    float px = state1.x;
    float py = state1.y;
    float pz = state1.z;
    float cr = state2.x;
    float cg = state2.y;
    float cb = state2.z;
    float seed_f = state2.w;
    
    uint agentSeed = uint(coord.x + coord.y * width);
    int agentIndex = coord.x + coord.y * width;
    int totalAgents = width * height;
    int maxParticles = int(float(totalAgents) * density * 0.01);
    
    bool isActive = agentIndex < maxParticles;
    
    // Check if needs initialization or reset
    if (state1.w < 0.5 || resetState) {
        uint initSeed = agentSeed + uint(time * 1000.0);
        
        // Initialize near attractor's typical range with wider spread
        px = (hash(initSeed) - 0.5) * 20.0;
        py = (hash(initSeed + 1u) - 0.5) * 20.0;
        pz = hash(initSeed + 2u) * 30.0 + 10.0;  // z: 10-40 for Lorenz
        
        // Sample color from input
        vec2 sampleUV = vec2(hash(initSeed + 3u), hash(initSeed + 4u));
        vec4 inputColor = texture(tex, sampleUV);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
        seed_f = hash(initSeed + 5u);
        
        outState1 = vec4(px, py, pz, 1.0);  // w=1 marks initialized
        outState2 = vec4(cr, cg, cb, seed_f);
        return;
    }
    
    if (!isActive) {
        outState1 = state1;
        outState2 = state2;
        return;
    }
    
    // Step the attractor
    float dt = speed * 0.01;
    vec3 pos = vec3(px, py, pz);
    pos = stepAttractor(pos, attractor, dt);
    
    // Check for divergence (NaN or too far)
    if (any(isnan(pos)) || length(pos) > 1000.0) {
        // Reinitialize
        uint respawnSeed = agentSeed + uint(time * 1000.0);
        pos.x = (hash(respawnSeed) - 0.5) * 20.0;
        pos.y = (hash(respawnSeed + 1u) - 0.5) * 20.0;
        pos.z = hash(respawnSeed + 2u) * 30.0 + 10.0;
        
        vec2 sampleUV = vec2(hash(respawnSeed + 3u), hash(respawnSeed + 4u));
        vec4 inputColor = texture(tex, sampleUV);
        cr = inputColor.r;
        cg = inputColor.g;
        cb = inputColor.b;
    }
    
    outState1 = vec4(pos, 1.0);
    outState2 = vec4(cr, cg, cb, seed_f);
}
