#version 300 es
precision highp float;
precision highp int;

// Standard uniforms
uniform vec2 resolution;
uniform float time;

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

// Input state from pipeline (from pointsEmit)
uniform sampler2D xyzTex;    // [x, y, z, alive]
uniform sampler2D velTex;    // [vx, vy, age, seed]
uniform sampler2D rgbaTex;   // [r, g, b, a]

// Output state (MRT)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

// === ORIGINAL BOIDS HELPER FUNCTIONS (PRESERVED EXACTLY) ===

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

float hashFloat(float n) {
    return fract(sin(n) * 43758.5453123);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0;
    return mix(
        mix(hashFloat(n), hashFloat(n + 1.0), f.x),
        mix(hashFloat(n + 57.0), hashFloat(n + 58.0), f.x),
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

// Spatial grid parameters - 16x16 grid cells
const int GRID_SIZE = 16;

ivec2 getGridCell(vec2 pos, vec2 res) {
    vec2 cellSize = res / float(GRID_SIZE);
    return ivec2(clamp(pos / cellSize, vec2(0.0), vec2(float(GRID_SIZE - 1))));
}

// === END ORIGINAL HELPER FUNCTIONS ===

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 stateSize = textureSize(xyzTex, 0);
    
    // Read input state from pipeline
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    
    // Extract components
    // xyz stores normalized coords [0,1], convert to pixel coords for algorithm
    float px = xyz.x;  // normalized x
    float py = xyz.y;  // normalized y
    float alive = xyz.w;
    
    // vel stores: [vx, vy, age, seed] - velocity in pixel space
    float vx = vel.x;
    float vy = vel.y;
    float age = vel.z;
    float seed = vel.w;
    
    uint boidId = uint(coord.x + coord.y * stateSize.x);
    
    // Convert normalized to pixel coords for the algorithm
    vec2 pos = vec2(px, py) * resolution;
    vec2 velocity = vec2(vx, vy);
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vel;
        outRGBA = rgba;
        return;
    }
    
    // Initialize velocity on first use (if zero from pointsEmit)
    if (length(velocity) == 0.0 && seed == 0.0) {
        seed = hash(boidId + 99999u);
        float angle = hash(boidId + 12345u) * 6.28318530718;
        float speed = hash(boidId + 23456u) * maxSpeed * 0.5 + maxSpeed * 0.25;
        velocity = vec2(cos(angle), sin(angle)) * speed;
    }
    
    // Attrition is now handled by pointsEmit

    // === ORIGINAL BOIDS ALGORITHM (PRESERVED EXACTLY) ===
    
    vec2 separationForce = vec2(0.0);
    vec2 alignmentSum = vec2(0.0);
    vec2 cohesionSum = vec2(0.0);
    int separationCount = 0;
    int alignmentCount = 0;
    int cohesionCount = 0;
    
    ivec2 myCell = getGridCell(pos, resolution);
    float perceptionSq = perceptionRadius * perceptionRadius;
    float separationSq = separationRadius * separationRadius;
    
    int totalBoids = stateSize.x * stateSize.y;
    
    // Sample neighbors - iterate through nearby agents
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            ivec2 checkCell = myCell + ivec2(dx, dy);
            
            if (boundaryMode == 0) {  // Wrap mode
                checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            } else {
                checkCell = clamp(checkCell, ivec2(0), ivec2(GRID_SIZE - 1));
            }
            
            uint cellSeed = uint(checkCell.y * GRID_SIZE + checkCell.x);
            
            for (int s = 0; s < 8; s++) {  // 8 samples per cell
                uint sampleSeed = cellSeed * 31u + uint(s) + uint(time * 10.0);
                int sampleIdx = int(hash_uint(sampleSeed) % uint(totalBoids));
                
                int sx = sampleIdx % stateSize.x;
                int sy = sampleIdx / stateSize.x;
                
                // Skip self
                if (sx == coord.x && sy == coord.y) continue;
                
                vec4 otherXyz = texelFetch(xyzTex, ivec2(sx, sy), 0);
                vec4 otherVel = texelFetch(velTex, ivec2(sx, sy), 0);
                
                // Skip dead agents
                if (otherXyz.w < 0.5) continue;
                
                vec2 otherPos = otherXyz.xy * resolution;
                vec2 otherVelocity = otherVel.xy;
                
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
                    separationForce += away / dist;
                    separationCount++;
                }
                
                // Alignment and Cohesion (perception radius)
                if (distSq < perceptionSq && distSq > 0.0) {
                    alignmentSum += otherVelocity;
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
            separationForce -= velocity;
            separationForce = limitVec(separationForce, maxForce);
            steer += separationForce * separation;
        }
    }
    
    // Alignment
    if (alignmentCount > 0) {
        vec2 avgVel = alignmentSum / float(alignmentCount);
        if (length(avgVel) > 0.0) {
            avgVel = setMag(avgVel, maxSpeed);
            vec2 alignSteer = avgVel - velocity;
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
            vec2 cohesionSteer = desired - velocity;
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
    velocity += steer;
    velocity = limitVec(velocity, maxSpeed);
    
    // Update position
    pos += velocity;
    
    // Boundary wrap
    if (boundaryMode == 0) {
        pos = wrapPosition(pos, resolution);
    } else {
        pos = clamp(pos, vec2(1.0), resolution - vec2(1.0));
    }
    
    // Update age
    age += 0.016;
    
    // === END ORIGINAL ALGORITHM ===
    
    // Convert back to normalized coords
    float newPx = pos.x / resolution.x;
    float newPy = pos.y / resolution.y;
    
    outXYZ = vec4(newPx, newPy, xyz.z, 1.0);
    outVel = vec4(velocity, age, seed);
    outRGBA = rgba;
}
