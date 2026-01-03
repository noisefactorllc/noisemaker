#version 300 es
precision highp float;

uniform float scale;
uniform int seed;
uniform int metric;
uniform float cellVariation;
uniform int volumeSize;
uniform int colorMode;

// MRT outputs: volume cache and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

// Volume dimensions - stored as 2D atlas
// Atlas layout: volumeSize x (volumeSize * volumeSize)
// Pixel (x, y) maps to 3D coordinate (x, y % volumeSize, y / volumeSize)

// PCG-based 3D hash for reproducible randomness
uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 hash3(vec3 p) {
    p = p + float(seed) * 0.1;
    uvec3 q = uvec3(ivec3(p * 1000.0) + 65536);
    q = pcg3d(q);
    return vec3(q) / 4294967295.0;
}

// 3D Worley/Cell noise - returns distance to nearest cell and cell ID
vec2 cellNoise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    
    float minDist = 10.0;
    float cellId = 0.0;
    
    // Search 3x3x3 neighborhood
    for (int z = -1; z <= 1; z++) {
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec3 neighbor = vec3(float(x), float(y), float(z));
                vec3 cellPos = i + neighbor;
                
                vec3 randomOffset = hash3(cellPos);
                float jitter = cellVariation * 0.01;
                vec3 cellPoint = neighbor + mix(vec3(0.5), randomOffset, jitter);
                
                vec3 diff = cellPoint - f;
                
                float dist;
                if (metric == 0) {
                    dist = length(diff);
                } else if (metric == 1) {
                    dist = abs(diff.x) + abs(diff.y) + abs(diff.z);
                } else {
                    dist = max(max(abs(diff.x), abs(diff.y)), abs(diff.z));
                }
                
                if (dist < minDist) {
                    minDist = dist;
                    // Encode cell ID for coloring
                    cellId = cellPos.x * 73.0 + cellPos.y * 157.0 + cellPos.z * 311.0;
                }
            }
        }
    }
    
    return vec2(minDist, cellId);
}

void main() {
    // Use uniform for volume size
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    // Atlas is volSize x (volSize * volSize)
    // Pixel (x, y) maps to 3D coordinate (x, y % volSize, y / volSize)
    
    ivec2 pixelCoord = ivec2(gl_FragCoord.xy);
    
    int x = pixelCoord.x;
    int y = pixelCoord.y % volSize;
    int z = pixelCoord.y / volSize;
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        fragColor = vec4(0.0);
        geoOut = vec4(0.5, 0.5, 0.5, 0.0);  // neutral normal, zero density
        return;
    }
    
    // Convert to normalized 3D coordinates in [-1, 1] world space (bounding box)
    // Use (volSizeF - 1.0) so texel 0 → -1.0 and texel N-1 → 1.0 exactly
    // This matches the sampling in the main shader which uses the same denominator
    vec3 p = vec3(float(x), float(y), float(z)) / (volSizeF - 1.0) * 2.0 - 1.0;
    
    // Scale for cell noise density (more cells = smaller p range * larger scale)
    vec3 scaledP = p * scale;
    
    // Compute cell noise at this point
    vec2 result = cellNoise3D(scaledP);
    float dist = result.x;
    float cellId = result.y;
    
    // Compute analytical gradient using finite differences
    float eps = 0.01 / scale;
    float dxp = cellNoise3D(scaledP + vec3(eps, 0.0, 0.0)).x;
    float dyp = cellNoise3D(scaledP + vec3(0.0, eps, 0.0)).x;
    float dzp = cellNoise3D(scaledP + vec3(0.0, 0.0, eps)).x;
    
    // Gradient points from low to high distance (toward cell center)
    vec3 gradient = vec3(dxp - dist, dyp - dist, dzp - dist) / eps;
    
    // Normal points outward (away from cell center)
    vec3 normal = normalize(-gradient + vec3(1e-6));
    
    // Normalize distance based on metric
    float normalizer;
    if (metric == 0) {
        normalizer = 0.866;  // Euclidean
    } else if (metric == 1) {
        normalizer = 1.5;    // Manhattan
    } else {
        normalizer = 0.6;    // Chebyshev
    }
    float normalizedDist = 1.0 - clamp(dist / normalizer, 0.0, 1.0);
    
    // Generate color from cell ID (for RGB mode)
    float h1 = fract(cellId * 0.0127);
    float h2 = fract(cellId * 0.0231);
    float h3 = fract(cellId * 0.0347);
    
    // Pack output based on colorMode
    // colorMode 0 = mono (grayscale), 1 = rgb (cell colors)
    if (colorMode == 0) {
        fragColor = vec4(normalizedDist, normalizedDist, normalizedDist, 1.0);
    } else {
        fragColor = vec4(normalizedDist, h1, h2, h3);
    }
    
    // Output analytical geometry: normal.xyz encoded [0,1], density in w
    geoOut = vec4(normal * 0.5 + 0.5, normalizedDist);
}
