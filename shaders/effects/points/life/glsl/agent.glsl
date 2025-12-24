#version 300 es
precision highp float;
precision highp int;

// Particle Life agent pass - Common Agent Architecture middleware
// Combined force evaluation + integration in single pass
// Reads from global_xyz/vel/rgba + internal data, writes back all 4
// Positions in normalized coords [0,1]

// Standard uniforms
uniform vec2 resolution;
uniform float time;

// Particle Life parameters
uniform int typeCount;
uniform float attractionScale;
uniform float repulsionScale;
uniform float minRadius;
uniform float maxRadius;
uniform float maxSpeed;
uniform float friction;
uniform int boundaryMode;
uniform float matrixSeed;
uniform bool symmetricForces;
uniform bool useTypeColor;

// Input state from pipeline (from pointsEmitter)
uniform sampler2D xyzTex;      // [x, y, 0, alive] - normalized coords
uniform sampler2D velTex;      // [vx, vy, age, seed]
uniform sampler2D rgbaTex;     // [r, g, b, a]
uniform sampler2D dataTex;     // [typeId, mass, 0, 0] - internal
uniform sampler2D forceMatrix; // [strength, prefDist, curveShape, 1]
uniform sampler2D inputTex;    // Source texture for color sampling

// Output state (MRT with 4 outputs)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;
layout(location = 3) out vec4 outData;

// === HASH FUNCTIONS ===

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

// === SPATIAL GRID ===

const int GRID_SIZE = 16;

ivec2 getGridCell(vec2 pos) {
    vec2 cellSize = vec2(1.0) / float(GRID_SIZE);
    return ivec2(clamp(pos / cellSize, vec2(0.0), vec2(float(GRID_SIZE - 1))));
}

// === FORCE FUNCTIONS ===

float radialForce(float dist, float strength, float prefDist, float curveShape) {
    float normDist = (dist - minRadius) / (maxRadius - minRadius);
    
    // Scale forces to velocity space: force magnitude should be proportional to maxSpeed
    // A full-strength force should produce significant but not instant max velocity
    float forceScale = maxSpeed * 10.0;
    
    if (normDist < 0.0) {
        // Inside minRadius: hard repulsion
        return -repulsionScale * (1.0 - dist / minRadius) * forceScale;
    }
    
    if (normDist > 1.0) {
        // Outside maxRadius: no force
        return 0.0;
    }
    
    // In the interaction band: apply force curve
    float force;
    if (normDist < prefDist) {
        force = strength * (normDist / prefDist);
    } else {
        force = strength * (1.0 - (normDist - prefDist) / (1.0 - prefDist));
    }
    
    // Apply curve shape
    float shaped = sign(force) * pow(abs(force), 1.0 - curveShape * 0.5);
    
    // Scale by attraction/repulsion multipliers and forceScale
    if (shaped > 0.0) {
        return shaped * attractionScale * forceScale;
    } else {
        return shaped * repulsionScale * forceScale;
    }
}

// === VECTOR HELPERS ===

vec2 wrapPosition(vec2 pos) {
    return mod(pos + 1.0, 1.0);
}

vec2 limitVec(vec2 v, float maxLen) {
    float len = length(v);
    if (len > maxLen && len > 0.0) {
        return v * (maxLen / len);
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
    vec4 data = texelFetch(dataTex, coord, 0);
    
    // Extract components (normalized coords [0,1])
    float px = xyz.x;
    float py = xyz.y;
    float alive = xyz.w;
    
    float vx = vel.x;
    float vy = vel.y;
    float age = vel.z;
    float seed = vel.w;
    
    float typeId = data.x;
    float mass = data.y;
    
    uint particleId = uint(coord.x + coord.y * stateSize.x);
    
    vec2 pos = vec2(px, py);
    vec2 velocity = vec2(vx, vy);
    
    // If not alive, pass through unchanged
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vel;
        outRGBA = rgba;
        outData = data;
        return;
    }
    
    // Initialize data on first use (typeId=0 and mass=0 means uninitialized)
    if (typeId == 0.0 && mass == 0.0) {
        uint initSeed = particleId + uint(time * 1000.0);
        typeId = floor(hash(initSeed + 4u) * float(typeCount));
        mass = 0.8 + hash(initSeed + 5u) * 0.4;
        
        // Initialize velocity if zero
        if (length(velocity) == 0.0) {
            float angle = hash(initSeed + 2u) * 6.28318530718;
            float speed = hash(initSeed + 3u) * maxSpeed * 0.3;
            velocity = vec2(cos(angle), sin(angle)) * speed;
        }
    }

    // Ensure mass is valid
    mass = max(mass, 0.1);
    
    // Attrition is now handled by pointsEmitter
    
    // === FORCE EVALUATION ===
    
    vec2 totalForce = vec2(0.0);
    int neighborCount = 0;
    int myType = int(typeId);
    
    ivec2 myCell = getGridCell(pos);
    int totalParticles = stateSize.x * stateSize.y;
    
    // Sample neighbors using spatial grid
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            ivec2 checkCell = myCell + ivec2(dx, dy);
            
            // Wrap cell coordinates
            checkCell = (checkCell + GRID_SIZE) % GRID_SIZE;
            
            uint cellSeed = uint(checkCell.y * GRID_SIZE + checkCell.x);
            
            // Sample particles from this cell
            for (int s = 0; s < 12; s++) {
                uint sampleSeed = cellSeed * 31u + uint(s) + uint(time * 7.0);
                int sampleIdx = int(hash_uint(sampleSeed) % uint(totalParticles));
                
                int sx = sampleIdx % stateSize.x;
                int sy = sampleIdx / stateSize.x;
                
                // Skip self
                if (sx == coord.x && sy == coord.y) continue;
                
                // Read neighbor state
                vec4 otherXyz = texelFetch(xyzTex, ivec2(sx, sy), 0);
                vec4 otherData = texelFetch(dataTex, ivec2(sx, sy), 0);
                
                vec2 otherPos = otherXyz.xy;
                float otherAlive = otherXyz.w;
                int otherType = int(otherData.x);
                
                // Skip dead or uninitialized
                if (otherAlive < 0.5) continue;
                
                // Calculate distance with wrapping (toroidal)
                vec2 diff = otherPos - pos;
                
                if (diff.x > 0.5) diff.x -= 1.0;
                if (diff.x < -0.5) diff.x += 1.0;
                if (diff.y > 0.5) diff.y -= 1.0;
                if (diff.y < -0.5) diff.y += 1.0;
                
                float dist = length(diff);
                
                // Skip if outside max interaction range
                if (dist < 0.0001 || dist > maxRadius) continue;
                
                // Look up force parameters from ForceMatrix
                vec4 forceParams = texelFetch(forceMatrix, ivec2(myType, otherType), 0);
                float strength = forceParams.x;
                float prefDist = forceParams.y;
                float curveShape = forceParams.z;
                
                // Calculate force magnitude
                float forceMag = radialForce(dist, strength, prefDist, curveShape);
                
                // Convert to force vector
                // diff points TO neighbor, so forceDir * positive = attraction, * negative = repulsion
                vec2 forceDir = diff / dist;
                totalForce += forceDir * forceMag;
                neighborCount++;
            }
        }
    }
    
    // Normalize by mass
    totalForce /= mass;
    
    // === INTEGRATION ===
    
    // Apply forces
    velocity += totalForce;
    
    // Apply friction/damping
    velocity *= (1.0 - friction);
    
    // Limit speed
    velocity = limitVec(velocity, maxSpeed);
    
    // Update position
    pos += velocity;
    
    // Handle boundaries
    if (boundaryMode == 0) {
        // Wrap (toroidal)
        pos = wrapPosition(pos);
    } else {
        // Bounce
        if (pos.x < 0.0) { pos.x = -pos.x; velocity.x = -velocity.x; }
        if (pos.x > 1.0) { pos.x = 2.0 - pos.x; velocity.x = -velocity.x; }
        if (pos.y < 0.0) { pos.y = -pos.y; velocity.y = -velocity.y; }
        if (pos.y > 1.0) { pos.y = 2.0 - pos.y; velocity.y = -velocity.y; }
        pos = clamp(pos, vec2(0.001), vec2(0.999));
    }
    
    // Update age
    age += 0.016;
    
    // Output updated state
    outXYZ = vec4(pos, 0.0, 1.0);
    outVel = vec4(velocity, age, seed);
    
    if (useTypeColor) {
        outRGBA = vec4(typeColor(int(typeId), typeCount), 1.0);
    } else {
        outRGBA = texture(inputTex, pos);
    }
    
    outData = vec4(typeId, mass, 0.0, 1.0);
}
