#version 300 es
precision highp float;

// ForceMatrix generator
// Each pixel [i,j] encodes the force parameters for type i -> type j interaction
// R = attraction/repulsion strength (-1 to 1)
// G = preferred distance (normalized)
// B = curve shape parameter
// A = reserved

uniform vec2 resolution;
uniform sampler2D prevMatrix;
uniform int typeCount;
uniform float matrixSeed;
uniform bool symmetricForces;
uniform bool resetState;
uniform bool randomizeMatrix;
uniform float time;

out vec4 fragColor;

// Hash function for deterministic random
uint hash_uint(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint seed) {
    return float(hash_uint(seed)) / 4294967295.0;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int typeA = coord.x;
    int typeB = coord.y;
    
    // Check if we need to regenerate
    vec4 prev = texelFetch(prevMatrix, coord, 0);
    
    // Only regenerate on reset or randomize button
    if (!resetState && !randomizeMatrix && prev.a > 0.0) {
        fragColor = prev;
        return;
    }
    
    // Skip if outside active types
    if (typeA >= typeCount || typeB >= typeCount) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Generate deterministic random based on seed and type pair
    uint seed = uint(matrixSeed * 1000.0) + uint(typeA * 31 + typeB * 17);
    
    // For symmetric forces, use a canonical ordering
    if (symmetricForces && typeB < typeA) {
        seed = uint(matrixSeed * 1000.0) + uint(typeB * 31 + typeA * 17);
    }
    
    // Same type always has mild repulsion (prevents clustering collapse)
    float strength;
    if (typeA == typeB) {
        strength = -0.3 - hash(seed) * 0.4;  // -0.3 to -0.7
    } else {
        // Random attraction or repulsion
        strength = hash(seed) * 2.0 - 1.0;  // -1 to 1
    }
    
    // Preferred distance (normalized 0-1, will be scaled by maxRadius)
    float prefDist = 0.3 + hash(seed + 1u) * 0.5;  // 0.3 to 0.8
    
    // Curve shape (0 = linear, 1 = steep)
    float curveShape = hash(seed + 2u);
    
    fragColor = vec4(strength, prefDist, curveShape, 1.0);
}
