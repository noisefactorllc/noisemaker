#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform sampler2D stateTex1;  // [posX, posY, velX, velY]
uniform sampler2D stateTex2;  // [r, g, b, age]
uniform sampler2D tex;        // Optional input texture for color sampling
uniform float time;
uniform bool resetState;

// Boids parameters
uniform float separation;
uniform float alignment;
uniform float cohesion;
uniform float perceptionRadius;
uniform float separationRadius;
uniform float maxSpeed;
uniform float maxForce;
uniform int boundaryMode;
uniform float wallMargin;
uniform float noiseWeight;
uniform float attrition;
uniform int colorMode;  // 0 = mono (white), 1 = sample from tex

layout(location = 0) out vec4 outState1;
layout(location = 1) out vec4 outState2;

// Hash functions for pseudo-random numbers
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

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// Simplex-like noise for turbulence
float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0;
    return mix(
        mix(hash(n), hash(n + 1.0), f.x),
        mix(hash(n + 57.0), hash(n + 58.0), f.x),
        f.y
    ) * 2.0 - 1.0;
}

vec2 wrapPosition(vec2 position, vec2 bounds) {
    return mod(position + bounds, bounds);
}

vec2 limitVec(vec2 v, float maxLen) {
    float len = length(v);
    if (len > maxLen && len > 0.0) {
        return v * (maxLen / len);
    }
    return v;
}

vec2 setMag(vec2 v, float mag) {
    float len = length(v);
    if (len > 0.0) {
        return v * (mag / len);
    }
    return v;
}

vec3 sampleInputColor(vec2 uv) {
    if (colorMode == 0) {
        return vec3(1.0);  // White for mono mode
    }
    vec2 flippedUV = vec2(uv.x, 1.0 - uv.y);
    return texture(tex, flippedUV).rgb;
}

// Spatial grid parameters - 16x16 grid cells
const int GRID_SIZE = 16;

// Get grid cell for a position
ivec2 getGridCell(vec2 pos) {
    vec2 cellSize = resolution / float(GRID_SIZE);
    return ivec2(clamp(pos / cellSize, vec2(0.0), vec2(float(GRID_SIZE - 1))));
}

void main() {
    ivec2 stateSize = textureSize(stateTex1, 0);
    vec2 stateUV = (gl_FragCoord.xy + vec2(0.5)) / vec2(stateSize);
    
    vec4 state1 = texture(stateTex1, stateUV);
    vec4 state2 = texture(stateTex2, stateUV);
    
    vec2 pos = state1.xy;
    vec2 vel = state1.zw;
    vec3 color = state2.rgb;
    float age = state2.a;
    
    uint boidId = uint(gl_FragCoord.y * float(stateSize.x) + gl_FragCoord.x);
    
    // Initialization / Reset
    if (resetState || (pos.x == 0.0 && pos.y == 0.0 && length(vel) == 0.0)) {
        uint seed = boidId + uint(time * 1000.0);
        pos = hash2(seed) * resolution;
        float angle = hash(seed + 2u) * 6.28318530718;
        float speed = hash(seed + 3u) * maxSpeed * 0.5 + maxSpeed * 0.25;
        vel = vec2(cos(angle), sin(angle)) * speed;
        age = hash(seed + 4u) * 10.0;
        color = sampleInputColor(pos / resolution);
        
        outState1 = vec4(pos, vel);
        outState2 = vec4(color, age);
        return;
    }
    
    // Attrition respawn
    if (attrition > 0.0) {
        uint time_seed = uint(time * 60.0);
        uint check_seed = boidId + time_seed * 747796405u;
        float respawnRand = hash(check_seed);
        float attritionRate = attrition * 0.01;
        
        if (respawnRand < attritionRate) {
            uint pos_seed = check_seed ^ 2891336453u;
            pos = hash2(pos_seed) * resolution;
            float angle = hash(pos_seed + 2u) * 6.28318530718;
            vel = vec2(cos(angle), sin(angle)) * maxSpeed * 0.5;
            age = 0.0;
            color = sampleInputColor(pos / resolution);
            
            outState1 = vec4(pos, vel);
            outState2 = vec4(color, age);
            return;
        }
    }
    
    // Boids algorithm with grid-accelerated neighbor search
    vec2 separationForce = vec2(0.0);
    vec2 alignmentSum = vec2(0.0);
    vec2 cohesionSum = vec2(0.0);
    int separationCount = 0;
    int alignmentCount = 0;
    int cohesionCount = 0;
    
    ivec2 myCell = getGridCell(pos);
    float perceptionSq = perceptionRadius * perceptionRadius;
    float separationSq = separationRadius * separationRadius;
    
    // Sample neighbors - iterate through nearby agents
    // For GPU efficiency, we sample a subset of agents in neighboring grid cells
    int totalBoids = stateSize.x * stateSize.y;
    
    // Sample strategy: check agents that hash to nearby grid cells
    // This is an approximation but works well for GPU parallelism
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            ivec2 checkCell = myCell + ivec2(dx, dy);
            
            // Handle wrapping for grid cells
            if (boundaryMode == 0) {  // Wrap mode
                checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            } else {
                // Clamp for soft wall mode
                checkCell = clamp(checkCell, ivec2(0), ivec2(GRID_SIZE - 1));
            }
            
            // Sample multiple agents per cell
            uint cellSeed = uint(checkCell.y * GRID_SIZE + checkCell.x);
            
            for (int s = 0; s < 8; s++) {  // 8 samples per cell
                uint sampleSeed = cellSeed * 31u + uint(s) + uint(time * 10.0);
                int sampleIdx = int(hash_uint(sampleSeed) % uint(totalBoids));
                
                int sx = sampleIdx % stateSize.x;
                int sy = sampleIdx / stateSize.x;
                
                // Skip self
                if (sx == int(gl_FragCoord.x) && sy == int(gl_FragCoord.y)) continue;
                
                vec4 otherState1 = texelFetch(stateTex1, ivec2(sx, sy), 0);
                vec2 otherPos = otherState1.xy;
                vec2 otherVel = otherState1.zw;
                
                // Calculate distance (with wrapping if needed)
                vec2 diff = otherPos - pos;
                if (boundaryMode == 0) {  // Wrap
                    if (diff.x > resolution.x * 0.5) diff.x -= resolution.x;
                    if (diff.x < -resolution.x * 0.5) diff.x += resolution.x;
                    if (diff.y > resolution.y * 0.5) diff.y -= resolution.y;
                    if (diff.y < -resolution.y * 0.5) diff.y += resolution.y;
                }
                
                float distSq = dot(diff, diff);
                
                // Separation (close neighbors)
                if (distSq < separationSq && distSq > 0.0) {
                    vec2 away = -diff;
                    float dist = sqrt(distSq);
                    separationForce += away / dist;  // Weight by inverse distance
                    separationCount++;
                }
                
                // Alignment and Cohesion (perception radius)
                if (distSq < perceptionSq && distSq > 0.0) {
                    alignmentSum += otherVel;
                    alignmentCount++;
                    
                    cohesionSum += otherPos;
                    cohesionCount++;
                }
            }
        }
    }
    
    // Calculate steering forces
    vec2 steer = vec2(0.0);
    
    // Separation
    if (separationCount > 0) {
        separationForce /= float(separationCount);
        if (length(separationForce) > 0.0) {
            separationForce = setMag(separationForce, maxSpeed);
            separationForce -= vel;
            separationForce = limitVec(separationForce, maxForce);
            steer += separationForce * separation;
        }
    }
    
    // Alignment
    if (alignmentCount > 0) {
        vec2 avgVel = alignmentSum / float(alignmentCount);
        if (length(avgVel) > 0.0) {
            avgVel = setMag(avgVel, maxSpeed);
            vec2 alignSteer = avgVel - vel;
            alignSteer = limitVec(alignSteer, maxForce);
            steer += alignSteer * alignment;
        }
    }
    
    // Cohesion
    if (cohesionCount > 0) {
        vec2 avgPos = cohesionSum / float(cohesionCount);
        vec2 desired = avgPos - pos;
        if (length(desired) > 0.0) {
            desired = setMag(desired, maxSpeed);
            vec2 cohesionSteer = desired - vel;
            cohesionSteer = limitVec(cohesionSteer, maxForce);
            steer += cohesionSteer * cohesion;
        }
    }
    
    // Noise/turbulence
    if (noiseWeight > 0.0) {
        float noiseScale = 0.01;
        float nx = noise2D(pos * noiseScale + time * 0.5);
        float ny = noise2D(pos * noiseScale + vec2(100.0, 100.0) + time * 0.5);
        vec2 noiseForce = vec2(nx, ny) * maxForce * noiseWeight;
        steer += noiseForce;
    }
    
    // Boundary handling
    if (boundaryMode == 1) {  // Soft wall
        vec2 wallForce = vec2(0.0);
        float turnStrength = maxForce * 2.0;
        
        if (pos.x < wallMargin) {
            wallForce.x = turnStrength * (1.0 - pos.x / wallMargin);
        } else if (pos.x > resolution.x - wallMargin) {
            wallForce.x = -turnStrength * (1.0 - (resolution.x - pos.x) / wallMargin);
        }
        
        if (pos.y < wallMargin) {
            wallForce.y = turnStrength * (1.0 - pos.y / wallMargin);
        } else if (pos.y > resolution.y - wallMargin) {
            wallForce.y = -turnStrength * (1.0 - (resolution.y - pos.y) / wallMargin);
        }
        
        steer += wallForce;
    }
    
    // Apply steering and update velocity
    vel += steer;
    vel = limitVec(vel, maxSpeed);
    
    // Update position
    pos += vel;
    
    // Boundary wrap
    if (boundaryMode == 0) {
        pos = wrapPosition(pos, resolution);
    } else {
        // Clamp to bounds for soft wall mode
        pos = clamp(pos, vec2(1.0), resolution - vec2(1.0));
    }
    
    // Update age
    age += 0.016;  // ~60fps time step
    
    outState1 = vec4(pos, vel);
    outState2 = vec4(color, age);
}
