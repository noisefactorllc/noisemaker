/*
 * 3D Cellular Automata simulation shader (GLSL)
 * Implements various 3D CA rules with Moore (26) or Von Neumann (6) neighborhoods
 * Self-initializing: detects empty buffer and seeds on first frame
 */

#version 300 es
precision highp float;

uniform float time;
uniform float seed;
uniform int volumeSize;
uniform int ruleIndex;
uniform int neighborMode;
uniform float speed;
uniform float density;
uniform float weight;
uniform bool resetState;
uniform sampler2D stateTex;
uniform sampler2D seedTex;  // 3D input volume atlas (inputTex3d)

out vec4 fragColor;

// Hash for initialization
float hash3(vec3 p) {
    p = p + seed * 0.1;
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

// Helper to convert 3D voxel coords to 2D atlas texel coords
ivec2 atlasTexel(ivec3 p, int volSize) {
    // Wrap coordinates for periodic boundary
    ivec3 wrapped = ivec3(
        (p.x + volSize) % volSize,
        (p.y + volSize) % volSize,
        (p.z + volSize) % volSize
    );
    return ivec2(wrapped.x, wrapped.y + wrapped.z * volSize);
}

// Sample state at voxel coordinate with wrapping
vec4 sampleState(ivec3 voxel, int volSize) {
    return texelFetch(stateTex, atlasTexel(voxel, volSize), 0);
}

// Sample seed texture at voxel coordinate (for inputTex3d seeding)
vec4 sampleSeed(ivec3 voxel, int volSize) {
    return texelFetch(seedTex, atlasTexel(voxel, volSize), 0);
}

// Count alive neighbors using Moore neighborhood (26 neighbors)
int countMooreNeighbors(ivec3 voxel, int volSize) {
    int count = 0;
    for (int dz = -1; dz <= 1; dz++) {
        for (int dy = -1; dy <= 1; dy++) {
            for (int dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0 && dz == 0) continue;
                vec4 neighbor = sampleState(voxel + ivec3(dx, dy, dz), volSize);
                if (neighbor.r > 0.5) count++;
            }
        }
    }
    return count;
}

// Count alive neighbors using Von Neumann neighborhood (6 neighbors)
int countVonNeumannNeighbors(ivec3 voxel, int volSize) {
    int count = 0;
    vec4 xp = sampleState(voxel + ivec3(1, 0, 0), volSize);
    vec4 xn = sampleState(voxel + ivec3(-1, 0, 0), volSize);
    vec4 yp = sampleState(voxel + ivec3(0, 1, 0), volSize);
    vec4 yn = sampleState(voxel + ivec3(0, -1, 0), volSize);
    vec4 zp = sampleState(voxel + ivec3(0, 0, 1), volSize);
    vec4 zn = sampleState(voxel + ivec3(0, 0, -1), volSize);
    
    if (xp.r > 0.5) count++;
    if (xn.r > 0.5) count++;
    if (yp.r > 0.5) count++;
    if (yn.r > 0.5) count++;
    if (zp.r > 0.5) count++;
    if (zn.r > 0.5) count++;
    
    return count;
}

/*
 * 3D CA Rulesets (Born/Survive notation with Moore 26-neighborhood)
 * 
 * 0: 445M       - B4/S4 (stable crystalline structures)
 * 1: 678 678    - B6,7,8/S6,7,8 (cloud-like growth)
 * 2: Amoeba     - B9-26/S5-7,12-13,15 (organic amoeba shapes)
 * 3: Builder1   - B4,6,8-9/S3-6,9 (structured builders)
 * 4: Builder2   - B3/S2-3 (classic 3D life variant)
 * 5: Clouds     - B13-26/S13-26 (dense cloud formations)
 * 6: Crystal    - B1,3/S1-2,4 (crystal growth patterns)
 * 7: Diamoeba   - B5-7,12/S5-8 (diamond-like amoeba)
 * 8: Pyroclastic- B4,5,6,7/S6,7,8 (volcanic-like expansion)
 * 9: Slow Decay - B4/S3,4 (slowly decaying structures)
 * 10: Spikey    - B5-8/S5-6,9 (spikey growth patterns)
 */

// Check if cell should be born
bool shouldBeBorn(int n, int rule) {
    if (rule == 0) return n == 4;                                       // 445M
    if (rule == 1) return n >= 6 && n <= 8;                             // 678 678
    if (rule == 2) return n >= 9;                                        // Amoeba
    if (rule == 3) return n == 4 || n == 6 || n == 8 || n == 9;         // Builder1
    if (rule == 4) return n == 3;                                        // Builder2 (3D Life)
    if (rule == 5) return n >= 13;                                       // Clouds
    if (rule == 6) return n == 1 || n == 3;                              // Crystal
    if (rule == 7) return n >= 5 && n <= 7 || n == 12;                  // Diamoeba
    if (rule == 8) return n >= 4 && n <= 7;                              // Pyroclastic
    if (rule == 9) return n == 4;                                        // Slow Decay
    if (rule == 10) return n >= 5 && n <= 8;                             // Spikey
    return false;
}

// Check if cell should survive
bool shouldSurvive(int n, int rule) {
    if (rule == 0) return n == 4;                                        // 445M
    if (rule == 1) return n >= 6 && n <= 8;                              // 678 678
    if (rule == 2) return (n >= 5 && n <= 7) || n == 12 || n == 13 || n == 15;  // Amoeba
    if (rule == 3) return (n >= 3 && n <= 6) || n == 9;                  // Builder1
    if (rule == 4) return n == 2 || n == 3;                              // Builder2 (3D Life)
    if (rule == 5) return n >= 13;                                       // Clouds
    if (rule == 6) return n == 1 || n == 2 || n == 4;                    // Crystal
    if (rule == 7) return n >= 5 && n <= 8;                              // Diamoeba
    if (rule == 8) return n >= 6 && n <= 8;                              // Pyroclastic
    if (rule == 9) return n == 3 || n == 4;                              // Slow Decay
    if (rule == 10) return n == 5 || n == 6 || n == 9;                   // Spikey
    return false;
}

void main() {
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    // Decode voxel position from atlas
    ivec2 pixelCoord = ivec2(gl_FragCoord.xy);
    int x = pixelCoord.x;
    int y = pixelCoord.y % volSize;
    int z = pixelCoord.y / volSize;
    ivec3 voxel = ivec3(x, y, z);
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        fragColor = vec4(0.0);
        return;
    }
    
    // Current state
    vec4 state = sampleState(voxel, volSize);
    float alive = state.r;
    float age = state.g;
    
    // Self-initialization or reset: detect empty buffer (first frame) or reset button
    bool bufferIsEmpty = (state.r == 0.0 && state.g == 0.0 && state.b == 0.0 && state.a == 0.0);
    
    if (bufferIsEmpty || resetState) {
        // Check if we have input from seedTex (inputTex3d)
        vec4 seedVal = sampleSeed(voxel, volSize);
        bool hasSeedInput = (seedVal.r > 0.0 || seedVal.g > 0.0 || seedVal.b > 0.0);
        
        if (hasSeedInput) {
            // Use seed texture luminance to determine initial alive state
            float lum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
            alive = lum > 0.5 ? 1.0 : 0.0;
            age = 0.0;
        } else {
            // Initialize with random sparse distribution
            vec3 p = vec3(float(x), float(y), float(z));
            float h = hash3(p);
            float threshold = density * 0.01;
            
            // Seed a sphere in the center plus random cells
            vec3 center = vec3(volSizeF * 0.5);
            float dist = length(p - center);
            float radius = volSizeF * 0.15;
            
            if (h < threshold || dist < radius) {
                alive = 1.0;
                age = 0.0;
            } else {
                alive = 0.0;
                age = 0.0;
            }
        }
        
        fragColor = vec4(alive, alive, alive, 1.0);
        return;
    }
    
    // Count neighbors based on neighborhood mode
    int neighbors;
    if (neighborMode == 0) {
        neighbors = countMooreNeighbors(voxel, volSize);
    } else {
        neighbors = countVonNeumannNeighbors(voxel, volSize);
    }
    
    // Apply CA rules
    float newAlive = 0.0;
    float newAge = age;
    
    if (alive > 0.5) {
        // Cell is alive - check survival
        if (shouldSurvive(neighbors, ruleIndex)) {
            newAlive = 1.0;
            newAge = min(age + 0.01, 1.0);  // Age increases while alive
        } else {
            newAlive = 0.0;
            newAge = 0.0;
        }
    } else {
        // Cell is dead - check birth
        if (shouldBeBorn(neighbors, ruleIndex)) {
            newAlive = 1.0;
            newAge = 0.0;
        } else {
            newAlive = 0.0;
            newAge = 0.0;
        }
    }
    
    // Speed control - interpolate between states
    float animSpeed = speed * 0.01;
    float finalAlive = mix(alive, newAlive, animSpeed);
    float finalAge = mix(age, newAge, animSpeed);
    
    // Apply input weight blending from seedTex (inputTex3d)
    if (weight > 0.0) {
        vec4 seedVal = sampleSeed(voxel, volSize);
        float seedLum = 0.299 * seedVal.r + 0.587 * seedVal.g + 0.114 * seedVal.b;
        finalAlive = mix(finalAlive, seedLum, weight * 0.01);
    }
    
    fragColor = vec4(finalAlive, finalAlive, finalAlive, 1.0);
}
