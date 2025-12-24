#version 300 es
precision highp float;
precision highp int;

// Integration Pass
// Applies forces, updates velocity/position, handles boundaries

uniform vec2 resolution;
uniform sampler2D stateTex1;  // [posX, posY, velX, velY]
uniform sampler2D stateTex2;  // [typeId, mass, age, flags]
uniform sampler2D stateTex3;  // [r, g, b, a] - color
uniform sampler2D forceTex;   // [forceX, forceY, neighborCount, 1]
uniform sampler2D tex;        // Optional input texture for color sampling
uniform float time;
uniform bool resetState;

uniform float maxSpeed;
uniform float friction;
uniform int boundaryMode;
uniform int typeCount;
uniform int colorMode;

layout(location = 0) out vec4 outState1;
layout(location = 1) out vec4 outState2;
layout(location = 2) out vec4 outState3;

// Hash functions
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

// Type colors (rainbow palette)
vec3 typeColor(int typeId, int totalTypes) {
    float hue = float(typeId) / float(totalTypes);
    // HSV to RGB
    float h = hue * 6.0;
    float c = 1.0;
    float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
    vec3 rgb;
    if (h < 1.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);
    return rgb;
}

vec3 sampleInputColor(vec2 uv) {
    if (colorMode == 0) {
        return vec3(1.0);  // Will be replaced by type color
    }
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    return texture(tex, flippedUV).rgb;
}

vec2 wrapPosition(vec2 pos, vec2 bounds) {
    return mod(pos + bounds, bounds);
}

vec2 limitVec(vec2 v, float maxLen) {
    float len = length(v);
    if (len > maxLen && len > 0.0) {
        return v * (maxLen / len);
    }
    return v;
}

void main() {
    ivec2 stateSize = textureSize(stateTex1, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);
    
    vec4 state1 = texelFetch(stateTex1, coord, 0);
    vec4 state2 = texelFetch(stateTex2, coord, 0);
    vec4 state3 = texelFetch(stateTex3, coord, 0);
    vec4 force = texelFetch(forceTex, coord, 0);
    
    vec2 pos = state1.xy;
    vec2 vel = state1.zw;
    float typeId = state2.x;
    float mass = state2.y;
    float age = state2.z;
    vec3 color = state3.rgb;
    
    uint particleId = uint(coord.y * stateSize.x + coord.x);
    
    // Initialization / Reset
    if (resetState || (pos.x == 0.0 && pos.y == 0.0 && length(vel) == 0.0)) {
        uint seed = particleId + uint(time * 1000.0);
        
        // Random position
        pos = hash2(seed) * resolution;
        
        // Random initial velocity
        float angle = hash(seed + 2u) * 6.28318530718;
        float speed = hash(seed + 3u) * maxSpeed * 0.3;
        vel = vec2(cos(angle), sin(angle)) * speed;
        
        // Random type
        typeId = floor(hash(seed + 4u) * float(typeCount));
        
        // Mass (slight variation)
        mass = 0.8 + hash(seed + 5u) * 0.4;
        
        age = 0.0;
        
        // Color based on type
        if (colorMode == 0) {
            color = typeColor(int(typeId), typeCount);
        } else {
            color = sampleInputColor(pos / resolution);
        }
        
        outState1 = vec4(pos, vel);
        outState2 = vec4(typeId, mass, age, 1.0);
        outState3 = vec4(color, 1.0);
        return;
    }
    
    // Apply forces (from force pass)
    vec2 accel = force.xy;
    
    // Update velocity
    vel += accel;
    
    // Apply friction/damping
    vel *= (1.0 - friction);
    
    // Limit speed
    vel = limitVec(vel, maxSpeed);
    
    // Update position
    pos += vel;
    
    // Handle boundaries
    if (boundaryMode == 0) {
        // Wrap (toroidal)
        pos = wrapPosition(pos, resolution);
    } else {
        // Bounce
        if (pos.x < 0.0) { pos.x = -pos.x; vel.x = -vel.x; }
        if (pos.x > resolution.x) { pos.x = 2.0 * resolution.x - pos.x; vel.x = -vel.x; }
        if (pos.y < 0.0) { pos.y = -pos.y; vel.y = -vel.y; }
        if (pos.y > resolution.y) { pos.y = 2.0 * resolution.y - pos.y; vel.y = -vel.y; }
        pos = clamp(pos, vec2(1.0), resolution - vec2(1.0));
    }
    
    // Update age
    age += 0.016;
    
    outState1 = vec4(pos, vel);
    outState2 = vec4(typeId, mass, age, 1.0);
    outState3 = vec4(color, 1.0);
}
