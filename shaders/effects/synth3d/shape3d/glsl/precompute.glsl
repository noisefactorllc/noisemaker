/*
 * Precompute shader for nu/shape3d
 * Fills a 64x4096 2D atlas representing a 64^3 3D volume
 * Each texel stores the shape offset value for that 3D position
 * Atlas layout: pixel (x, y) maps to 3D coord (x, y % 64, floor(y / 64))
 */

#version 300 es
precision highp float;

uniform int loopAOffset;
uniform int loopBOffset;
uniform float loopAScale;
uniform float loopBScale;
uniform float loopAAmp;
uniform float loopBAmp;
uniform int volumeSize;

// MRT outputs: volume cache and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float periodicFunction(float p) {
    float x = TAU * p;
    return map(sin(x), -1.0, 1.0, 0.0, 1.0);
}

// ============================================
// 3D Polyhedral SDF Functions
// Based on Inigo Quilez's SDF library
// ============================================

// Tetrahedron (4 faces, 4 vertices)
float tetrahedronSDF(vec3 p) {
    float s = 0.5;
    return (max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) - s) / sqrt(3.0);
}

// Cube / Hexahedron (6 faces, 8 vertices)
float cubeSDF(vec3 p) {
    vec3 d = abs(p) - vec3(0.45);
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Octahedron (8 faces, 6 vertices)
float octahedronSDF(vec3 p) {
    p = abs(p);
    float s = 0.5;
    return (p.x + p.y + p.z - s) * 0.57735027;
}

// Dodecahedron (12 pentagonal faces, 20 vertices)
// Uses the golden ratio for face normals
float dodecahedronSDF(vec3 p) {
    p = abs(p);
    float phi = (1.0 + sqrt(5.0)) * 0.5;  // Golden ratio
    
    // Face normals use golden ratio
    vec3 n1 = normalize(vec3(1.0, phi, 0.0));
    vec3 n2 = normalize(vec3(0.0, 1.0, phi));
    vec3 n3 = normalize(vec3(phi, 0.0, 1.0));
    
    float d = 0.0;
    d = max(d, dot(p, n1));
    d = max(d, dot(p, n2));
    d = max(d, dot(p, n3));
    d = max(d, p.x);
    d = max(d, p.y);
    d = max(d, p.z);
    
    return d - 0.45;
}

// Icosahedron (20 triangular faces, 12 vertices)
// Dual of dodecahedron, also uses golden ratio
float icosahedronSDF(vec3 p) {
    p = abs(p);
    float phi = (1.0 + sqrt(5.0)) * 0.5;
    
    // Vertex directions use golden ratio
    vec3 n1 = normalize(vec3(phi, 1.0, 0.0));
    vec3 n2 = normalize(vec3(1.0, 0.0, phi));
    vec3 n3 = normalize(vec3(0.0, phi, 1.0));
    
    // All 10 face normal directions (20 faces = 10 pairs)
    float d = 0.0;
    d = max(d, dot(p, n1));
    d = max(d, dot(p, n2));
    d = max(d, dot(p, n3));
    d = max(d, dot(p, normalize(vec3(1.0, 1.0, 1.0))));
    
    return d - 0.42;
}

// ============================================
// Other 3D Primitive SDFs
// ============================================

// Sphere
float sphereSDF(vec3 p) {
    return length(p) - 0.5;
}

// Torus
float torusSDF(vec3 p) {
    vec2 t = vec2(0.35, 0.12);
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

// Cylinder
float cylinderSDF(vec3 p) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(0.35, 0.45);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Cone
float coneSDF(vec3 p) {
    float h = 0.6;
    float r = 0.4;
    vec2 c = normalize(vec2(h, r));
    float q = length(p.xz);
    return max(dot(c.xy, vec2(q, p.y)), -p.y - h * 0.5);
}

// Capsule (vertical)
float capsuleSDF(vec3 p) {
    float h = 0.3;
    float r = 0.25;
    p.y -= clamp(p.y, -h, h);
    return length(p) - r;
}

// Get SDF value for shape type
// Returns distance from surface (negative = inside)
float shapeSDF(vec3 p, int shapeType) {
    // Platonic Solids
    if (shapeType == 10) return tetrahedronSDF(p);
    if (shapeType == 20) return cubeSDF(p);
    if (shapeType == 30) return octahedronSDF(p);
    if (shapeType == 40) return dodecahedronSDF(p);
    if (shapeType == 50) return icosahedronSDF(p);
    
    // Other Primitives
    if (shapeType == 100) return sphereSDF(p);
    if (shapeType == 110) return torusSDF(p);
    if (shapeType == 120) return cylinderSDF(p);
    if (shapeType == 130) return coneSDF(p);
    if (shapeType == 140) return capsuleSDF(p);
    
    // Default to sphere
    return sphereSDF(p);
}

// Get offset value for a position
// p is in [0, 1]^3 normalized volume coordinates
float offset3D(vec3 p, float freq, int loopOffset, float loopAmp) {
    // Center at origin: [0,1] -> [-0.5, 0.5]
    vec3 cp = p - 0.5;
    
    // Get SDF and convert to offset
    // SDF is negative inside, positive outside
    // We want high values inside, low outside for proper isosurface
    float sdf = shapeSDF(cp, loopOffset);
    
    // Convert SDF to offset: invert and scale
    // Larger freq = more repetitions of the periodic pattern
    return (0.5 - sdf) * freq;
}

// Compute full output value for a position (for gradient computation)
float computeValue(vec3 p, float lf1, float lf2, float amp1, float amp2) {
    float offset1 = offset3D(p, lf1, loopAOffset, amp1);
    float offset2 = offset3D(p, lf2, loopBOffset, amp2);
    
    float t1 = p.z;
    float t2 = p.z;
    
    if (loopAAmp < 0.0) {
        t1 = t1 + offset1;
    } else if (loopAAmp > 0.0) {
        t1 = t1 - offset1;
    }
    
    if (loopBAmp < 0.0) {
        t2 = t2 + offset2;
    } else if (loopBAmp > 0.0) {
        t2 = t2 - offset2;
    }
    
    float a = periodicFunction(t1);
    float b = periodicFunction(t2);
    
    float combined = a * amp1 + b * amp2;
    float totalAmp = amp1 + amp2;
    return (totalAmp > 0.0) ? combined / totalAmp : 0.5;
}

void main() {
    // Convert 2D fragment position to 3D volume coordinates
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    int x = int(gl_FragCoord.x);
    int yAtlas = int(gl_FragCoord.y);
    int y = yAtlas % volSize;
    int z = yAtlas / volSize;
    
    // Normalize to [0, 1]
    vec3 p = vec3(float(x), float(y), float(z)) / (volSizeF - 1.0);
    
    // Calculate frequencies from scale parameters
    float lf1 = map(loopAScale, 1.0, 100.0, 6.0, 1.0);
    float lf2 = map(loopBScale, 1.0, 100.0, 6.0, 1.0);
    
    // Calculate amplitudes
    float amp1 = map(abs(loopAAmp), 0.0, 100.0, 0.0, 1.0);
    float amp2 = map(abs(loopBAmp), 0.0, 100.0, 0.0, 1.0);
    
    // Compute value at this position
    float d = computeValue(p, lf1, lf2, amp1, amp2);
    
    // Compute analytical gradient using finite differences
    float eps = 1.0 / volSizeF;
    float dx = computeValue(p + vec3(eps, 0.0, 0.0), lf1, lf2, amp1, amp2);
    float dy = computeValue(p + vec3(0.0, eps, 0.0), lf1, lf2, amp1, amp2);
    float dz = computeValue(p + vec3(0.0, 0.0, eps), lf1, lf2, amp1, amp2);
    
    vec3 gradient = vec3(dx - d, dy - d, dz - d) / eps;
    vec3 normal = normalize(-gradient + vec3(1e-6));
    
    fragColor = vec4(d, d, d, 1.0);
    geoOut = vec4(normal * 0.5 + 0.5, d);
}
