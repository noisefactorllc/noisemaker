#version 300 es
precision highp float;
precision highp int;

// Pairwise Force Evaluation Pass
// Accumulates forces from all neighbors using ForceMatrix lookup

uniform vec2 resolution;
uniform sampler2D stateTex1;  // [posX, posY, velX, velY]
uniform sampler2D stateTex2;  // [typeId, mass, age, flags]
uniform sampler2D forceMatrix;
uniform float time;

uniform int typeCount;
uniform float attractionScale;
uniform float repulsionScale;
uniform float minRadius;
uniform float maxRadius;

out vec4 fragColor;

// Hash for stochastic neighbor sampling
uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

// Spatial grid for neighbor queries
const int GRID_SIZE = 16;

ivec2 getGridCell(vec2 pos, vec2 bounds) {
    vec2 cellSize = bounds / float(GRID_SIZE);
    return ivec2(clamp(pos / cellSize, vec2(0.0), vec2(float(GRID_SIZE - 1))));
}

// Radial force function
// Returns force magnitude (positive = attraction, negative = repulsion)
float radialForce(float dist, float strength, float prefDist, float curveShape) {
    // Normalize distance to 0-1 range based on minRadius/maxRadius
    float normDist = (dist - minRadius) / (maxRadius - minRadius);
    
    if (normDist < 0.0) {
        // Inside minRadius: hard repulsion
        return -repulsionScale * (1.0 - dist / minRadius);
    }
    
    if (normDist > 1.0) {
        // Outside maxRadius: no force
        return 0.0;
    }
    
    // In the interaction band: apply force curve
    // Simple piecewise linear: ramp up to peak at prefDist, then down
    float force;
    if (normDist < prefDist) {
        // Ramp from 0 to strength
        force = strength * (normDist / prefDist);
    } else {
        // Ramp from strength to 0
        force = strength * (1.0 - (normDist - prefDist) / (1.0 - prefDist));
    }
    
    // Apply curve shape (steeper near peak)
    float shaped = sign(force) * pow(abs(force), 1.0 - curveShape * 0.5);
    
    // Scale by attraction/repulsion multipliers
    if (shaped > 0.0) {
        return shaped * attractionScale;
    } else {
        return shaped * repulsionScale;
    }
}

void main() {
    ivec2 stateSize = textureSize(stateTex1, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);
    
    // Read this particle's state
    vec4 state1 = texelFetch(stateTex1, coord, 0);
    vec4 state2 = texelFetch(stateTex2, coord, 0);
    
    vec2 pos = state1.xy;
    int myType = int(state2.x);
    float myMass = max(state2.y, 0.1);
    
    // Skip if particle not initialized
    if (pos.x == 0.0 && pos.y == 0.0 && state1.z == 0.0 && state1.w == 0.0) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Accumulate forces
    vec2 totalForce = vec2(0.0);
    int neighborCount = 0;
    
    int totalParticles = stateSize.x * stateSize.y;
    uint particleId = uint(coord.y * stateSize.x + coord.x);
    
    // Sample neighbors using spatial grid approach
    ivec2 myCell = getGridCell(pos, resolution);
    
    // Check neighboring cells
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
                vec4 otherState1 = texelFetch(stateTex1, ivec2(sx, sy), 0);
                vec4 otherState2 = texelFetch(stateTex2, ivec2(sx, sy), 0);
                
                vec2 otherPos = otherState1.xy;
                int otherType = int(otherState2.x);
                
                // Skip uninitialized
                if (otherPos.x == 0.0 && otherPos.y == 0.0) continue;
                
                // Calculate distance with wrapping
                vec2 diff = otherPos - pos;
                
                // Wrap for toroidal topology
                if (diff.x > resolution.x * 0.5) diff.x -= resolution.x;
                if (diff.x < -resolution.x * 0.5) diff.x += resolution.x;
                if (diff.y > resolution.y * 0.5) diff.y -= resolution.y;
                if (diff.y < -resolution.y * 0.5) diff.y += resolution.y;
                
                float dist = length(diff);
                
                // Skip if outside max interaction range
                if (dist < 0.001 || dist > maxRadius) continue;
                
                // Look up force parameters from ForceMatrix
                vec4 forceParams = texelFetch(forceMatrix, ivec2(myType, otherType), 0);
                float strength = forceParams.x;
                float prefDist = forceParams.y;
                float curveShape = forceParams.z;
                
                // Calculate force magnitude
                float forceMag = radialForce(dist, strength, prefDist, curveShape);
                
                // Convert to force vector (toward or away from neighbor)
                vec2 forceDir = diff / dist;
                totalForce += forceDir * forceMag;
                neighborCount++;
            }
        }
    }
    
    // Normalize by mass (F = ma, so a = F/m)
    totalForce /= myMass;
    
    // Output accumulated force
    fragColor = vec4(totalForce, float(neighborCount), 1.0);
}
