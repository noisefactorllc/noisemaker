/*
 * Universal 3D volume renderer with advanced lighting (GLSL)
 * 
 * Raymarches through a 3D volume texture to find isosurfaces,
 * with configurable bounding shapes and Blinn-Phong lighting.
 * 
 * Bounding shapes: cube, sphere
 * Lighting: diffuse, specular, ambient, rim
 */

#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float threshold;
uniform int invert;
uniform int volumeSize;
uniform int shape;
uniform int orbitSpeed;
uniform vec3 cameraPosition;
uniform vec3 bgColor;
uniform float bgAlpha;
uniform sampler2D volumeCache;

// Lighting uniforms
uniform vec3 lightDirection;
uniform vec3 diffuseColor;
uniform float diffuseIntensity;
uniform vec3 specularColor;
uniform float specularIntensity;
uniform float shininess;
uniform vec3 ambientColor;
uniform float rimIntensity;
uniform float rimPower;

// MRT outputs: color and geometry buffer
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

const float TAU = 6.283185307179586;
const float PI = 3.141592653589793;
const int MAX_STEPS = 256;
const float MAX_DIST = 10.0;
const float NEAR_CLIP = 0.01;

// Helper to convert 3D texel coords to 2D atlas texel coords
ivec2 atlasTexel(ivec3 p, int volSize) {
    return ivec2(p.x, p.y + p.z * volSize);
}

// Sample the cached 3D volume with trilinear interpolation
// World position p is in [-1, 1]^3 (bounding box coordinates)
vec4 sampleVolume(vec3 worldPos) {
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    
    // Convert world position [-1, 1] to normalized volume coords [0, 1]
    vec3 uvw = worldPos * 0.5 + 0.5;
    uvw = clamp(uvw, 0.0, 1.0);
    
    // Convert to texel coordinates
    vec3 texelPos = uvw * (volSizeF - 1.0);
    vec3 texelFloor = floor(texelPos);
    vec3 frac = texelPos - texelFloor;
    
    ivec3 i0 = ivec3(texelFloor);
    ivec3 i1 = min(i0 + 1, volSize - 1);
    
    // Trilinear filtering - sample all 8 corners
    vec4 c000 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i0.y, i0.z), volSize), 0);
    vec4 c100 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i0.y, i0.z), volSize), 0);
    vec4 c010 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i1.y, i0.z), volSize), 0);
    vec4 c110 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i1.y, i0.z), volSize), 0);
    vec4 c001 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i0.y, i1.z), volSize), 0);
    vec4 c101 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i0.y, i1.z), volSize), 0);
    vec4 c011 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i1.y, i1.z), volSize), 0);
    vec4 c111 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i1.y, i1.z), volSize), 0);
    
    // Trilinear interpolation
    vec4 c00 = mix(c000, c100, frac.x);
    vec4 c10 = mix(c010, c110, frac.x);
    vec4 c01 = mix(c001, c101, frac.x);
    vec4 c11 = mix(c011, c111, frac.x);
    
    vec4 c0 = mix(c00, c10, frac.y);
    vec4 c1 = mix(c01, c11, frac.y);
    
    return mix(c0, c1, frac.z);
}

// Get the scalar field value at a point
// HIGH values = SOLID, field < 0 = inside solid
float getField(vec3 p) {
    float val = sampleVolume(p).r;
    if (invert == 1) {
        val = 1.0 - val;
    }
    return threshold - val;
}

// Compute smooth normal using central differences
vec3 calcNormal(vec3 p) {
    float eps = 2.0 / float(volumeSize);
    
    float dx = getField(p + vec3(eps, 0.0, 0.0)) - getField(p - vec3(eps, 0.0, 0.0));
    float dy = getField(p + vec3(0.0, eps, 0.0)) - getField(p - vec3(0.0, eps, 0.0));
    float dz = getField(p + vec3(0.0, 0.0, eps)) - getField(p - vec3(0.0, 0.0, eps));
    
    vec3 n = vec3(dx, dy, dz);
    float len = length(n);
    if (len < 0.0001) return vec3(0.0, 1.0, 0.0);
    
    return n / len;
}

// Compute outward normal for bounding shape at position p
vec3 calcBoundaryNormal(vec3 p) {
    if (shape == 0) {
        // Cube: normal points outward from nearest face
        vec3 absP = abs(p);
        if (absP.x > absP.y && absP.x > absP.z) {
            return vec3(sign(p.x), 0.0, 0.0);
        } else if (absP.y > absP.z) {
            return vec3(0.0, sign(p.y), 0.0);
        } else {
            return vec3(0.0, 0.0, sign(p.z));
        }
    } else {
        // Sphere: normal is just the normalized position
        return normalize(p);
    }
}

// Ray-box intersection (cube shape)
// Returns (tEnter, tExit) or (-1, -1) if no hit
vec2 intersectBox(vec3 ro, vec3 rd) {
    vec3 invRd = 1.0 / rd;
    vec3 t0 = (-1.0 - ro) * invRd;
    vec3 t1 = (1.0 - ro) * invRd;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tEnter = max(max(tmin.x, tmin.y), tmin.z);
    float tExit = min(min(tmax.x, tmax.y), tmax.z);
    
    if (tEnter > tExit || tExit < 0.0) {
        return vec2(-1.0);
    }
    return vec2(tEnter, tExit);
}

// Ray-sphere intersection (radius 1 centered at origin)
// Returns (tEnter, tExit) or (-1, -1) if no hit
vec2 intersectSphere(vec3 ro, vec3 rd) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - 1.0;
    float disc = b * b - c;
    
    if (disc < 0.0) {
        return vec2(-1.0);
    }
    
    float sqrtDisc = sqrt(disc);
    float tEnter = -b - sqrtDisc;
    float tExit = -b + sqrtDisc;
    
    if (tExit < 0.0) {
        return vec2(-1.0);
    }
    return vec2(tEnter, tExit);
}

// Get ray bounds based on selected shape
// Returns (tStart, tEnd) accounting for near clip
vec2 getRayBounds(vec3 ro, vec3 rd) {
    vec2 t;
    
    if (shape == 0) {
        // Cube
        t = intersectBox(ro, rd);
    } else {
        // Sphere
        t = intersectSphere(ro, rd);
    }
    
    if (t.x < 0.0 && t.y < 0.0) {
        return vec2(-1.0);
    }
    
    // Apply near clip (handles camera inside volume)
    t.x = max(t.x, NEAR_CLIP);
    
    return t;
}

// Isosurface hit result
struct IsoHit {
    float dist;
    vec3 pos;
    bool hit;
    bool atBoundary;  // true if hit at bounding shape edge, not isosurface
};

// Raymarching with bisection refinement
IsoHit raymarch(vec3 ro, vec3 rd) {
    IsoHit result;
    result.hit = false;
    result.dist = -1.0;
    result.pos = vec3(0.0);
    result.atBoundary = false;
    
    vec2 bounds = getRayBounds(ro, rd);
    if (bounds.x < 0.0) return result;
    
    float tStart = bounds.x;
    float tEnd = bounds.y;
    
    // Step size based on volume resolution
    float stepSize = 1.5 / float(volumeSize);
    
    // March through volume
    float t = tStart;
    float prevField = getField(ro + rd * t);
    
    // If we start inside solid, hit immediately at boundary
    if (prevField < 0.0) {
        result.hit = true;
        result.dist = tStart;
        result.pos = ro + rd * tStart;
        result.atBoundary = true;
        return result;
    }
    
    for (int i = 0; i < MAX_STEPS; i++) {
        t += stepSize;
        if (t > tEnd) break;
        
        vec3 p = ro + rd * t;
        
        // For bounded shapes, check if still in bounds
        if (shape == 0) {
            // Cube bounds check
            if (any(lessThan(p, vec3(-1.0))) || any(greaterThan(p, vec3(1.0)))) {
                break;
            }
        } else if (shape == 1) {
            // Sphere bounds check
            if (dot(p, p) > 1.0) {
                break;
            }
        }
        // Plane and none don't need bounds checks (already handled by tEnd)
        
        float field = getField(p);
        
        // Check for sign change (threshold crossing)
        if (prevField * field < 0.0) {
            // Found crossing - refine with bisection
            float tLo = t - stepSize;
            float tHi = t;
            
            for (int j = 0; j < 8; j++) {
                float tMid = (tLo + tHi) * 0.5;
                float fMid = getField(ro + rd * tMid);
                
                if (prevField * fMid < 0.0) {
                    tHi = tMid;
                } else {
                    tLo = tMid;
                    prevField = fMid;
                }
            }
            
            result.hit = true;
            result.dist = (tLo + tHi) * 0.5;
            result.pos = ro + rd * result.dist;
            return result;
        }
        
        prevField = field;
    }
    
    return result;
}

// Advanced lighting calculation
vec3 applyLighting(vec3 baseColor, vec3 n, vec3 rd, vec3 worldLightDir) {
    vec3 lightDir = normalize(worldLightDir);
    vec3 viewDir = -rd;
    
    // Ensure normal faces the camera
    if (dot(n, viewDir) < 0.0) {
        n = -n;
    }
    
    // Ambient lighting
    vec3 ambient = ambientColor * baseColor;
    
    // Diffuse lighting (Lambertian)
    float diffuseFactor = max(dot(n, lightDir), 0.0);
    vec3 diffuse = diffuseColor * diffuseFactor * baseColor * diffuseIntensity;
    
    // Specular lighting (Blinn-Phong)
    vec3 halfDir = normalize(lightDir + viewDir);
    float specAngle = max(dot(halfDir, n), 0.0);
    float specularFactor = pow(specAngle, shininess);
    vec3 specular = specularColor * specularFactor * specularIntensity;
    
    // Fresnel rim lighting
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), rimPower);
    vec3 rimLight = vec3(rim) * rimIntensity;
    
    return ambient + diffuse + specular + rimLight;
}

// Shading - uses RGB from volume for coloring
vec3 shade(vec3 p, vec3 n, vec3 rd, vec3 worldLightDir) {
    vec4 volColor = sampleVolume(p);
    vec3 baseColor = volColor.rgb;
    
    // If volume appears grayscale, use neutral gray
    float colorVariance = length(volColor.rgb - vec3(volColor.r));
    if (colorVariance < 0.01) {
        baseColor = vec3(0.75);
    }
    
    return applyLighting(baseColor, n, rd, worldLightDir);
}

void main() {
    vec2 res = resolution;
    if (res.x < 1.0) res = vec2(1024.0, 1024.0);
    
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
    
    // Camera setup - fixed position, volume rotates
    // Scale camera position from 0-1 UI range to world coords
    vec3 ro = cameraPosition * vec3(-1.0, 1.0, 1.0) * 3.5;
    
    // Camera looks at origin; handle case when at origin
    vec3 forward;
    if (length(ro) < 0.001) {
        forward = vec3(0.0, 0.0, -1.0);  // Default: look into volume
    } else {
        forward = normalize(-ro);  // Look toward origin
    }
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    // Handle looking straight up/down
    if (abs(dot(forward, worldUp)) > 0.999) {
        worldUp = vec3(0.0, 0.0, 1.0);
    }
    vec3 right = normalize(cross(worldUp, forward));
    vec3 up = cross(forward, right);
    
    vec3 rd = normalize(forward + uv.x * right + uv.y * up);
    
    // Light direction is fixed in world space (not view space)
    vec3 worldLightDir = normalize(lightDirection * vec3(-1.0, 1.0, 1.0));
    
    // Rotate ray into volume space
    float angle = time * TAU * float(orbitSpeed);
    float c = cos(angle);
    float s = sin(angle);
    // Rotation around Y axis
    vec3 roVol = vec3(ro.x * c + ro.z * s, ro.y, -ro.x * s + ro.z * c);
    vec3 rdVol = vec3(rd.x * c + rd.z * s, rd.y, -rd.x * s + rd.z * c);
    
    vec3 color;
    vec3 normal = vec3(0.0, 0.0, 1.0);
    float depth = 1.0;
    float alpha = 1.0;
    
    IsoHit hit = raymarch(roVol, rdVol);
    if (hit.hit) {
        if (hit.atBoundary) {
            normal = calcBoundaryNormal(hit.pos);
        } else {
            normal = calcNormal(hit.pos);
        }
        // Rotate normal back to world space
        normal = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
        // Use world-space rd for consistent lighting (normal is in world space)
        color = shade(hit.pos, normal, rd, worldLightDir);
        depth = hit.dist / MAX_DIST;
    } else {
        color = bgColor;
        alpha = bgAlpha;
    }
    
    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));
    
    fragColor = vec4(color, alpha);
    geoOut = vec4(normal * 0.5 + 0.5, depth);
}
