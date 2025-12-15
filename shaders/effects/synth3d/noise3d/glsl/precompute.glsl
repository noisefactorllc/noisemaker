#version 300 es
precision highp float;

uniform float time;
uniform float scale;
uniform float seed;
uniform int octaves;
uniform int ridges;
uniform int volumeSize;
uniform int colorMode;

// MRT outputs: volume cache and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

// Volume dimensions - stored as 2D atlas
// Atlas layout: volumeSize x (volumeSize * volumeSize)
// Pixel (x, y) maps to 3D coordinate (x, y % volumeSize, y / volumeSize)

const float TAU = 6.283185307179586;
const float W_PERIOD = 4.0;  // Period length in w-axis lattice units for seamless time loop

// Improved hash using multiple rounds of mixing (4D version)
float hash4(vec4 p) {
    vec4 ps = p + seed * 0.1;
    uvec4 q = uvec4(ivec4(ps * 1000.0) + 65536);
    q = q * 1664525u + 1013904223u;
    q.x += q.y * q.z;
    q.y += q.z * q.w;
    q.z += q.w * q.x;
    q.w += q.x * q.y;
    q ^= q >> 16u;
    q.x += q.y * q.z;
    q.y += q.z * q.w;
    q.z += q.w * q.x;
    q.w += q.x * q.y;
    return float(q.x ^ q.y ^ q.z ^ q.w) / 4294967295.0;
}

// Gradient from hash - returns normalized 4D vector
vec4 grad4(vec4 p) {
    float h1 = hash4(p);
    float h2 = hash4(p + 127.1);
    float h3 = hash4(p + 269.5);
    float h4 = hash4(p + 419.2);
    vec4 g = vec4(
        h1 * 2.0 - 1.0,
        h2 * 2.0 - 1.0,
        h3 * 2.0 - 1.0,
        h4 * 2.0 - 1.0
    );
    return normalize(g);
}

// Quintic interpolation for smooth transitions
float quintic(float t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Wrap w index for periodicity at lattice level
float wrapW(float w) {
    return mod(w, W_PERIOD);
}

// 4D gradient noise - Perlin-style with quintic interpolation
// w-axis is periodic with period W_PERIOD for seamless time looping
float noise4D(vec4 p) {
    vec4 i = floor(p);
    vec4 f = fract(p);
    
    vec4 u = vec4(quintic(f.x), quintic(f.y), quintic(f.z), quintic(f.w));
    
    // Wrap w indices for periodicity
    float iw0 = wrapW(i.w);
    float iw1 = wrapW(i.w + 1.0);
    
    // 16 corners of 4D hypercube with wrapped w
    // w=0 corners
    float n0000 = dot(grad4(vec4(i.xyz, iw0) + vec4(0,0,0,0)), f - vec4(0,0,0,0));
    float n1000 = dot(grad4(vec4(i.xyz, iw0) + vec4(1,0,0,0)), f - vec4(1,0,0,0));
    float n0100 = dot(grad4(vec4(i.xyz, iw0) + vec4(0,1,0,0)), f - vec4(0,1,0,0));
    float n1100 = dot(grad4(vec4(i.xyz, iw0) + vec4(1,1,0,0)), f - vec4(1,1,0,0));
    float n0010 = dot(grad4(vec4(i.xyz, iw0) + vec4(0,0,1,0)), f - vec4(0,0,1,0));
    float n1010 = dot(grad4(vec4(i.xyz, iw0) + vec4(1,0,1,0)), f - vec4(1,0,1,0));
    float n0110 = dot(grad4(vec4(i.xyz, iw0) + vec4(0,1,1,0)), f - vec4(0,1,1,0));
    float n1110 = dot(grad4(vec4(i.xyz, iw0) + vec4(1,1,1,0)), f - vec4(1,1,1,0));
    // w=1 corners
    float n0001 = dot(grad4(vec4(i.xyz, iw1) + vec4(0,0,0,0)), f - vec4(0,0,0,1));
    float n1001 = dot(grad4(vec4(i.xyz, iw1) + vec4(1,0,0,0)), f - vec4(1,0,0,1));
    float n0101 = dot(grad4(vec4(i.xyz, iw1) + vec4(0,1,0,0)), f - vec4(0,1,0,1));
    float n1101 = dot(grad4(vec4(i.xyz, iw1) + vec4(1,1,0,0)), f - vec4(1,1,0,1));
    float n0011 = dot(grad4(vec4(i.xyz, iw1) + vec4(0,0,1,0)), f - vec4(0,0,1,1));
    float n1011 = dot(grad4(vec4(i.xyz, iw1) + vec4(1,0,1,0)), f - vec4(1,0,1,1));
    float n0111 = dot(grad4(vec4(i.xyz, iw1) + vec4(0,1,1,0)), f - vec4(0,1,1,1));
    float n1111 = dot(grad4(vec4(i.xyz, iw1) + vec4(1,1,1,0)), f - vec4(1,1,1,1));
    
    // Quadrilinear interpolation
    // First along x
    float nx000 = mix(n0000, n1000, u.x);
    float nx100 = mix(n0100, n1100, u.x);
    float nx010 = mix(n0010, n1010, u.x);
    float nx110 = mix(n0110, n1110, u.x);
    float nx001 = mix(n0001, n1001, u.x);
    float nx101 = mix(n0101, n1101, u.x);
    float nx011 = mix(n0011, n1011, u.x);
    float nx111 = mix(n0111, n1111, u.x);
    
    // Then along y
    float nxy00 = mix(nx000, nx100, u.y);
    float nxy10 = mix(nx010, nx110, u.y);
    float nxy01 = mix(nx001, nx101, u.y);
    float nxy11 = mix(nx011, nx111, u.y);
    
    // Then along z
    float nxyz0 = mix(nxy00, nxy10, u.z);
    float nxyz1 = mix(nxy01, nxy11, u.z);
    
    // Finally along w
    return mix(nxyz0, nxyz1, u.w);
}

// FBM using 4D noise with periodic w for time
float fbm4D(vec4 p, int ridgesMode) {
    const int MAX_OCT = 8;
    float amplitude = 0.5;
    float frequency = 1.0;
    float sum = 0.0;
    float maxVal = 0.0;
    int oct = octaves;
    if (oct < 1) oct = 1;
    
    for (int i = 0; i < MAX_OCT; i++) {
        if (i >= oct) break;
        vec4 pos = vec4(p.xyz * frequency, p.w);
        float n = noise4D(pos);
        n = clamp(n * 1.5, -1.0, 1.0);
        if (ridgesMode == 1) {
            n = 1.0 - abs(n);
        } else {
            n = (n + 1.0) * 0.5;
        }
        sum += n * amplitude;
        maxVal += amplitude;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return sum / maxVal;
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
    // This matches the bounding box used in the main raymarching shader
    vec3 p = vec3(float(x), float(y), float(z)) / (volSizeF - 1.0) * 2.0 - 1.0;
    
    // Scale for noise density (same as main shader)
    vec3 scaledP = p * scale;
    
    // Linear time traversal with periodic w-axis
    // time goes 0->1, map to 0->W_PERIOD for one complete loop
    float w = time * W_PERIOD;
    
    // Compute 4D FBM noise at this point with time as w
    vec4 p4d = vec4(scaledP, w);
    float noiseVal = fbm4D(p4d, ridges);
    
    // Compute analytical gradient using finite differences in noise space
    // Use small epsilon scaled to the noise frequency
    float eps = 0.01 / scale;
    float nx = fbm4D(vec4(scaledP + vec3(eps, 0.0, 0.0), w), ridges);
    float ny = fbm4D(vec4(scaledP + vec3(0.0, eps, 0.0), w), ridges);
    float nz = fbm4D(vec4(scaledP + vec3(0.0, 0.0, eps), w), ridges);
    
    // Gradient points from low to high density
    vec3 gradient = vec3(nx - noiseVal, ny - noiseVal, nz - noiseVal) / eps;
    
    // Normal points outward (from high to low density), encode in [0,1] range
    vec3 normal = normalize(-gradient + vec3(1e-6));
    
    // Output volume data based on colorMode
    // colorMode 0 = mono (grayscale), 1 = rgb (different noise per channel)
    if (colorMode == 0) {
        fragColor = vec4(noiseVal, noiseVal, noiseVal, 1.0);
    } else {
        // For RGB color mode, compute 3 different noise channels with offsets
        float g = fbm4D(vec4(scaledP, w) + vec4(0.0, 0.0, 0.0, 1.33), ridges);
        float b = fbm4D(vec4(scaledP, w) + vec4(0.0, 0.0, 0.0, 2.67), ridges);
        fragColor = vec4(noiseVal, g, b, 1.0);
    }
    
    // Output analytical geometry: normal.xyz encoded [0,1], density in w
    geoOut = vec4(normal * 0.5 + 0.5, noiseVal);
}
