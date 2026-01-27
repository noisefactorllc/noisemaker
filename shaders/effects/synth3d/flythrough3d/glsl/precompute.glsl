#version 300 es
precision highp float;

// Uniforms
uniform float time;
uniform int volumeSize;
uniform int fractalType;
uniform float power;
uniform int iterations;
uniform float bailout;
uniform float speed;
uniform float voiSize;
uniform float seed;

const float SAFETY_RADIUS = 0.08;

// MRT outputs: volume cache and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// ============================================================================
// FLYTHROUGH ENGINE - Orbital path through fractal interior
// ============================================================================
// 
// The fractal has interior voids and corridors. The camera follows an orbital
// path that weaves through these spaces, creating a true flythrough effect.
//
// Path design:
// 1. Base orbit: tilted ellipse or trefoil knot inside the fractal boundary
// 2. The path stays in empty space (positive distance field)
// 3. Camera looks along the path tangent (forward motion)
// 4. Wobble adds exploration perpendicular to the main path

// Simple hash for procedural variation
float hash(float n) {
    return fract(sin(n + seed) * 43758.5453123);
}

// ============================================================================
// ORBIT PATH GENERATION
// ============================================================================

// Trefoil knot - creates a complex 3D orbit path
// Radius ~0.6-0.8 stays inside the Mandelbulb boundary (~1.5) but in interior voids
vec3 trefoilKnot(float t, float scale) {
    // Trefoil parametric: winds 3 times around one axis, 2 times around another
    float p = 2.0, q = 3.0;
    float r = 0.5 + 0.2 * cos(q * t);
    return scale * vec3(
        r * cos(p * t),
        r * sin(p * t),
        0.3 * sin(q * t)
    );
}

// Tilted elliptical orbit - simpler but effective
vec3 tiltedOrbit(float t, float scale) {
    float tilt = 0.4;  // ~23 degrees, like Earth's axial tilt
    
    // Ellipse in XY plane
    float a = 1.0, b = 0.7;  // Semi-major and semi-minor axes
    vec3 pos = vec3(
        a * cos(t),
        b * sin(t),
        0.0
    );
    
    // Apply tilt rotation around X axis
    float c = cos(tilt), s = sin(tilt);
    pos = vec3(pos.x, pos.y * c - pos.z * s, pos.y * s + pos.z * c);
    
    return scale * pos;
}

// Lissajous curve - figure-8 style 3D path
vec3 lissajousOrbit(float t, float scale) {
    // Lissajous with irrational frequency ratio for non-repeating path
    float fx = 1.0, fy = 1.618, fz = 2.0;  // Golden ratio for Y
    float px = 0.0, py = PI * 0.5, pz = PI * 0.25;  // Phase offsets
    
    return scale * vec3(
        sin(fx * t + px),
        sin(fy * t + py) * 0.6,
        sin(fz * t + pz) * 0.4
    );
}

// Get orbital position based on seed selection
vec3 getOrbitPosition(float t) {
    // Orbit radius: stay well inside the fractal (~0.6-0.8 of boundary)
    // Mandelbulb boundary is ~1.5, Mandelbox ~2.0
    float orbitScale = 0.7;
    
    // Use seed to select orbit type
    int orbitType = int(mod(seed * 3.0, 3.0));
    
    if (orbitType == 0) {
        return trefoilKnot(t, orbitScale);
    } else if (orbitType == 1) {
        return tiltedOrbit(t, orbitScale);
    } else {
        return lissajousOrbit(t, orbitScale);
    }
}

// Get orbit tangent (velocity direction) via finite difference
vec3 getOrbitTangent(float t) {
    float dt = 0.01;
    vec3 p0 = getOrbitPosition(t);
    vec3 p1 = getOrbitPosition(t + dt);
    return normalize(p1 - p0);
}

// Add wobble/exploration perpendicular to path
vec3 getWobbleOffset(float t, vec3 tangent) {
    // Create perpendicular basis
    vec3 up = vec3(0.0, 1.0, 0.0);
    if (abs(dot(tangent, up)) > 0.99) {
        up = vec3(1.0, 0.0, 0.0);
    }
    vec3 right = normalize(cross(tangent, up));
    vec3 realUp = normalize(cross(right, tangent));
    
    // Multi-frequency wobble for organic motion
    float wobbleAmp = 0.15;
    float wx = sin(t * 2.7 + seed * PI) * wobbleAmp;
    float wy = sin(t * 1.9 + seed * TAU) * wobbleAmp * 0.7;
    
    return right * wx + realUp * wy;
}

// ============================================================================
// CAMERA STATE
// ============================================================================

void getCameraState(float t, out vec3 pos, out vec3 dir, out vec3 up) {
    // Time along orbit - speed controls how fast we travel
    float orbitTime = t * speed * 0.3;  // 0.3 gives comfortable pace
    
    // Base position on orbit
    vec3 orbitPos = getOrbitPosition(orbitTime);
    
    // Tangent gives forward direction
    vec3 tangent = getOrbitTangent(orbitTime);
    
    // Add wobble for exploration
    vec3 wobble = getWobbleOffset(orbitTime, tangent);
    pos = orbitPos + wobble;
    
    // Look along the path (forward motion)
    dir = tangent;
    
    // Up vector: maintain consistent orientation
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(worldUp, dir));
    up = normalize(cross(dir, right));
    
    // Add slight roll for dynamism
    float roll = sin(orbitTime * 0.5) * 0.1;
    vec3 rollRight = right * cos(roll) + up * sin(roll);
    up = normalize(cross(rollRight, dir));
}

// ============================================================================
// MANDELBULB - Distance estimator with orbit trap
// ============================================================================

struct FractalResult {
    float dist;
    float trap;
    float iterRatio;
};

FractalResult mandelbulb(vec3 pos, float n, int maxIter, float bail) {
    FractalResult result;
    vec3 z = pos;
    float dr = 1.0;
    float r = 0.0;
    float trap = 1e10;
    float iter = 0.0;
    
    for (int i = 0; i < maxIter; i++) {
        r = length(z);
        if (r > bail) break;
        
        trap = min(trap, r);
        
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        
        dr = pow(r, n - 1.0) * n * dr + 1.0;
        
        float zr = pow(r, n);
        float newTheta = theta * n;
        float newPhi = phi * n;
        
        z = zr * vec3(
            sin(newTheta) * cos(newPhi),
            sin(newTheta) * sin(newPhi),
            cos(newTheta)
        );
        z += pos;
        
        iter += 1.0;
    }
    
    result.dist = 0.5 * log(r) * r / dr;
    result.trap = trap;
    result.iterRatio = iter / float(maxIter);
    return result;
}

// ============================================================================
// MANDELBOX - Distance estimator
// ============================================================================

vec3 boxFold(vec3 z, float foldLimit) {
    return clamp(z, -foldLimit, foldLimit) * 2.0 - z;
}

FractalResult mandelbox(vec3 pos, float scale, int maxIter, float bail) {
    FractalResult result;
    vec3 z = pos;
    float dr = 1.0;
    float trap = 1e10;
    float iter = 0.0;
    
    float foldLimit = 1.0;
    float minRadius2 = 0.25;
    float fixedRadius2 = 1.0;
    
    for (int i = 0; i < maxIter; i++) {
        z = boxFold(z, foldLimit);
        
        float r2 = dot(z, z);
        if (r2 < minRadius2) {
            float factor = fixedRadius2 / minRadius2;
            z *= factor;
            dr *= factor;
        } else if (r2 < fixedRadius2) {
            float factor = fixedRadius2 / r2;
            z *= factor;
            dr *= factor;
        }
        
        z = z * scale + pos;
        dr = dr * abs(scale) + 1.0;
        
        float planeTrap = min(min(abs(z.x), abs(z.y)), abs(z.z));
        trap = min(trap, planeTrap);
        
        iter += 1.0;
        
        if (length(z) > bail) break;
    }
    
    float r = length(z);
    result.dist = r / abs(dr);
    result.trap = trap;
    result.iterRatio = iter / float(maxIter);
    return result;
}

// ============================================================================
// UNIFIED FRACTAL INTERFACE
// ============================================================================

FractalResult computeFractal(vec3 p) {
    if (fractalType == 0) {
        return mandelbulb(p, power, iterations, bailout);
    } else {
        return mandelbox(p, power, iterations, bailout);
    }
}

vec3 computeGradient(vec3 p, float eps) {
    float d0 = computeFractal(p).dist;
    float dx = computeFractal(p + vec3(eps, 0.0, 0.0)).dist;
    float dy = computeFractal(p + vec3(0.0, eps, 0.0)).dist;
    float dz = computeFractal(p + vec3(0.0, 0.0, eps)).dist;
    return vec3(dx - d0, dy - d0, dz - d0) / eps;
}

// ============================================================================
// COLLISION AVOIDANCE - Push camera away from surfaces
// ============================================================================

vec3 applyCollisionAvoidance(vec3 pos) {
    FractalResult fr = computeFractal(pos);
    
    if (fr.dist < SAFETY_RADIUS) {
        vec3 grad = computeGradient(pos, 0.01);
        vec3 pushDir = normalize(grad + vec3(1e-6));
        float pushDist = SAFETY_RADIUS - fr.dist;
        pos += pushDir * pushDist * 1.5;  // Extra margin
    }
    
    return pos;
}

// ============================================================================
// MAIN
// ============================================================================

void main() {
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    // Atlas coordinates -> 3D voxel coordinates
    ivec2 pixelCoord = ivec2(gl_FragCoord.xy);
    int vx = pixelCoord.x;
    int vy = pixelCoord.y % volSize;
    int vz = pixelCoord.y / volSize;
    
    // Bounds check
    if (vx >= volSize || vy >= volSize || vz >= volSize) {
        fragColor = vec4(0.0);
        geoOut = vec4(0.5, 0.5, 0.5, 0.0);
        return;
    }
    
    // Get camera state
    vec3 camPos, camDir, camUp;
    getCameraState(time, camPos, camDir, camUp);
    
    // Apply collision avoidance
    camPos = applyCollisionAvoidance(camPos);
    
    // Build camera basis
    vec3 camRight = normalize(cross(camDir, camUp));
    camUp = normalize(cross(camRight, camDir));
    
    // Convert voxel coords to normalized coords [-1, 1]^3
    vec3 normalizedCoord = (vec3(float(vx), float(vy), float(vz)) / (volSizeF - 1.0)) * 2.0 - 1.0;
    
    // VOI centered on camera, looking forward
    float halfExtent = voiSize * 0.5;
    vec3 voiOffset = camDir * halfExtent;  // Center VOI ahead of camera
    
    vec3 worldPos = camPos + voiOffset
                  + camRight * normalizedCoord.x * halfExtent
                  + camUp * normalizedCoord.y * halfExtent
                  + camDir * normalizedCoord.z * halfExtent;
    
    // Compute fractal
    FractalResult fr = computeFractal(worldPos);
    
    // Distance to density mapping
    float dist = fr.dist;
    float normalizedDist = 1.0 - clamp(dist * 2.0 + 0.5, 0.0, 1.0);
    
    float trap = clamp(fr.trap * 0.5, 0.0, 1.0);
    float iterRatio = fr.iterRatio;
    
    // Compute normal from gradient
    float eps = 0.02;
    vec3 gradient = computeGradient(worldPos, eps);
    vec3 normal = normalize(gradient + vec3(1e-6));
    
    // Output
    fragColor = vec4(normalizedDist, trap, iterRatio, 1.0);
    geoOut = vec4(normal * 0.5 + 0.5, normalizedDist);
}
