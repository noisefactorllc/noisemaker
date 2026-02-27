#version 300 es
precision highp float;

uniform int volumeSize;
uniform int type;
uniform float power;
uniform int iterations;
uniform float bailout;
uniform float juliaX;
uniform float juliaY;
uniform float juliaZ;
uniform int colorMode;

// MRT outputs: volume cache and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

const float PI = 3.141592653589793;

// Mandelbulb distance estimator
// Returns (distance estimate, orbit trap distance, iteration ratio)
vec3 mandelbulb(vec3 pos, float n, int maxIter, float bail) {
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
    
    float dist = 0.5 * log(r) * r / dr;
    
    return vec3(dist, trap, iter / float(maxIter));
}

// Julia Mandelbulb
vec3 juliaBulb(vec3 pos, vec3 c, float n, int maxIter, float bail) {
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
        z += c;
        
        iter += 1.0;
    }
    
    float dist = 0.5 * log(r) * r / dr;
    return vec3(dist, trap, iter / float(maxIter));
}

// Box fold operation
vec3 boxFold(vec3 z, float foldingLimit) {
    return clamp(z, -foldingLimit, foldingLimit) * 2.0 - z;
}

// Mandelcube distance estimator
vec3 mandelcube(vec3 pos, float scale, int maxIter, float bail) {
    vec3 z = pos;
    float dr = 1.0;
    float trap = 1e10;
    float iter = 0.0;
    
    float foldingLimit = 1.0;
    float minRadius = 0.5;
    float fixedRadius = 1.0;
    
    for (int i = 0; i < maxIter; i++) {
        z = boxFold(z, foldingLimit);
        
        float r2 = dot(z, z);
        float minR2 = minRadius * minRadius;
        float fixedR2 = fixedRadius * fixedRadius;
        
        if (r2 < minR2) {
            float factor = fixedR2 / minR2;
            z *= factor;
            dr *= factor;
        } else if (r2 < fixedR2) {
            float factor = fixedR2 / r2;
            z *= factor;
            dr *= factor;
        }
        
        z = z * scale + pos;
        dr = dr * abs(scale) + 1.0;
        
        trap = min(trap, length(z));
        iter += 1.0;
        
        if (length(z) > bail) break;
    }
    
    float r = length(z);
    float dist = r / abs(dr);
    
    return vec3(dist, trap, iter / float(maxIter));
}

// Julia Mandelcube
vec3 juliaCube(vec3 pos, vec3 c, float scale, int maxIter, float bail) {
    vec3 z = pos;
    float dr = 1.0;
    float trap = 1e10;
    float iter = 0.0;
    
    float foldingLimit = 1.0;
    float minRadius = 0.5;
    float fixedRadius = 1.0;
    
    for (int i = 0; i < maxIter; i++) {
        z = boxFold(z, foldingLimit);
        
        float r2 = dot(z, z);
        float minR2 = minRadius * minRadius;
        float fixedR2 = fixedRadius * fixedRadius;
        
        if (r2 < minR2) {
            float factor = fixedR2 / minR2;
            z *= factor;
            dr *= factor;
        } else if (r2 < fixedR2) {
            float factor = fixedR2 / r2;
            z *= factor;
            dr *= factor;
        }
        
        z = z * scale + c;
        dr = dr * abs(scale) + 1.0;
        
        trap = min(trap, length(z));
        iter += 1.0;
        
        if (length(z) > bail) break;
    }
    
    float r = length(z);
    float dist = r / abs(dr);
    
    return vec3(dist, trap, iter / float(maxIter));
}

// Helper to get SDF result for a position
vec3 computeFractal(vec3 p, vec3 juliaC) {
    if (type == 0) {
        return mandelbulb(p, power, iterations, bailout);
    } else if (type == 1) {
        float scale = clamp(power * 0.25, -3.0, 3.0);
        return mandelcube(p, scale, iterations, bailout);
    } else if (type == 2) {
        return juliaBulb(p, juliaC, power, iterations, bailout);
    } else {
        float scale = clamp(power * 0.25, -3.0, 3.0);
        return juliaCube(p, juliaC, scale, iterations, bailout);
    }
}

void main() {
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    ivec2 pixelCoord = ivec2(gl_FragCoord.xy);
    
    int x = pixelCoord.x;
    int y = pixelCoord.y % volSize;
    int z = pixelCoord.y / volSize;
    
    if (x >= volSize || y >= volSize || z >= volSize) {
        fragColor = vec4(0.0);
        geoOut = vec4(0.5, 0.5, 0.5, 0.0);
        return;
    }
    
    vec3 p = (vec3(float(x), float(y), float(z)) / (volSizeF - 1.0) * 2.0 - 1.0) * 1.5;
    
    vec3 juliaC = vec3(juliaX, juliaY, juliaZ) * 0.01;
    
    vec3 result = computeFractal(p, juliaC);
    
    float dist = result.x;
    float normalizedDist = 1.0 - clamp(dist * 2.0 + 0.5, 0.0, 1.0);
    
    float trap = clamp(result.y * 0.5, 0.0, 1.0);
    float iterRatio = result.z;
    
    // Compute analytical gradient using finite differences on the SDF
    float eps = 0.01;
    float dxp = computeFractal(p + vec3(eps, 0.0, 0.0), juliaC).x;
    float dyp = computeFractal(p + vec3(0.0, eps, 0.0), juliaC).x;
    float dzp = computeFractal(p + vec3(0.0, 0.0, eps), juliaC).x;
    
    vec3 gradient = vec3(dxp - dist, dyp - dist, dzp - dist) / eps;
    vec3 normal = normalize(gradient + vec3(1e-6));  // SDF gradient points outward
    
    // Output volume data based on colorMode
    // colorMode 0 = mono (grayscale), 1 = rgb (distance, trap, iteration)
    if (colorMode == 0) {
        fragColor = vec4(normalizedDist, normalizedDist, normalizedDist, 1.0);
    } else {
        fragColor = vec4(normalizedDist, trap, iterRatio, 1.0);
    }
    geoOut = vec4(normal * 0.5 + 0.5, normalizedDist);
}
