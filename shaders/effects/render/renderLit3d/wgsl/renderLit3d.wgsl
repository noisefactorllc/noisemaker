/*
 * Universal 3D volume renderer with advanced lighting (WGSL)
 * 
 * Raymarches through a 3D volume texture to find isosurfaces,
 * with configurable bounding shapes and Blinn-Phong lighting.
 * 
 * Bounding shapes: cube, sphere
 * Lighting: diffuse, specular, ambient, rim
 */

// Uniforms struct with explicit padding to match std140 layout
// Field names MUST match definition.js uniform names exactly
struct Uniforms {
    // Built-in globals - vec2f has 8-byte align
    resolution: vec2f,    // offset 0, size 8
    time: f32,            // offset 8, size 4
    threshold: f32,       // offset 12, size 4
    // i32 scalars can be packed sequentially (4-byte align each)
    volumeSize: i32,      // offset 16, size 4
    invert: i32,          // offset 20, size 4  
    shape: i32,           // offset 24, size 4
    orbitSpeed: i32,      // offset 28, size 4
    // vec3f has 16-byte align, so cameraPosition starts at offset 32
    cameraPosition: vec3f,   // offset 32, size 12
    // bgAlpha can fit after cameraPosition
    bgAlpha: f32,         // offset 44, size 4
    // Next vec3f must align to 16 bytes -> offset 48
    bgColor: vec3f,       // offset 48, size 12
    diffuseIntensity: f32,   // offset 60, size 4
    // Next vec3f must align to 16 bytes -> offset 64
    lightDirection: vec3f,   // offset 64, size 12
    specularIntensity: f32,  // offset 76, size 4
    // Next vec3f must align to 16 bytes -> offset 80
    diffuseColor: vec3f,     // offset 80, size 12
    shininess: f32,          // offset 92, size 4
    // Next vec3f must align to 16 bytes -> offset 96
    specularColor: vec3f,    // offset 96, size 12
    rimIntensity: f32,       // offset 108, size 4
    // Next vec3f must align to 16 bytes -> offset 112
    ambientColor: vec3f,     // offset 112, size 12
    rimPower: f32,           // offset 124, size 4
    // Struct size: 128 bytes (already 16-byte aligned)
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var volumeCache: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    // Fullscreen triangle - 3 vertices that cover the entire screen when clipped
    let positions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f(3.0, -1.0),
        vec2f(-1.0, 3.0)
    );
    let pos = positions[vertexIndex];
    var output: VertexOutput;
    output.position = vec4f(pos, 0.0, 1.0);
    output.uv = pos * 0.5 + 0.5;
    return output;
}

struct FragmentOutput {
    @location(0) color: vec4f,
    @location(1) geo: vec4f,
}

const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.141592653589793;
const MAX_STEPS: i32 = 256;
const MAX_DIST: f32 = 10.0;
const NEAR_CLIP: f32 = 0.01;

// Helper to convert 3D texel coords to 2D atlas texel coords
fn atlasTexel(p: vec3i, volSize: i32) -> vec2i {
    return vec2i(p.x, p.y + p.z * volSize);
}

// Sample the cached 3D volume with trilinear interpolation
fn sampleVolume(worldPos: vec3f) -> vec4f {
    let volSize = u.volumeSize;
    let volSizeF = f32(volSize);
    
    // Convert world position [-1, 1] to normalized volume coords [0, 1]
    var uvw = worldPos * 0.5 + 0.5;
    uvw = clamp(uvw, vec3f(0.0), vec3f(1.0));
    
    // Convert to texel coordinates
    let texelPos = uvw * (volSizeF - 1.0);
    let texelFloor = floor(texelPos);
    let frac = texelPos - texelFloor;
    
    let i0 = vec3i(texelFloor);
    let i1 = min(i0 + 1, vec3i(volSize - 1));
    
    // Trilinear filtering - sample all 8 corners
    let c000 = textureLoad(volumeCache, atlasTexel(vec3i(i0.x, i0.y, i0.z), volSize), 0);
    let c100 = textureLoad(volumeCache, atlasTexel(vec3i(i1.x, i0.y, i0.z), volSize), 0);
    let c010 = textureLoad(volumeCache, atlasTexel(vec3i(i0.x, i1.y, i0.z), volSize), 0);
    let c110 = textureLoad(volumeCache, atlasTexel(vec3i(i1.x, i1.y, i0.z), volSize), 0);
    let c001 = textureLoad(volumeCache, atlasTexel(vec3i(i0.x, i0.y, i1.z), volSize), 0);
    let c101 = textureLoad(volumeCache, atlasTexel(vec3i(i1.x, i0.y, i1.z), volSize), 0);
    let c011 = textureLoad(volumeCache, atlasTexel(vec3i(i0.x, i1.y, i1.z), volSize), 0);
    let c111 = textureLoad(volumeCache, atlasTexel(vec3i(i1.x, i1.y, i1.z), volSize), 0);
    
    // Trilinear interpolation
    let c00 = mix(c000, c100, frac.x);
    let c10 = mix(c010, c110, frac.x);
    let c01 = mix(c001, c101, frac.x);
    let c11 = mix(c011, c111, frac.x);
    
    let c0 = mix(c00, c10, frac.y);
    let c1 = mix(c01, c11, frac.y);
    
    return mix(c0, c1, frac.z);
}

// Get the scalar field value at a point
fn getField(p: vec3f) -> f32 {
    var val = sampleVolume(p).r;
    if (u.invert == 1) {
        val = 1.0 - val;
    }
    return u.threshold - val;
}

// Compute smooth normal using central differences
fn calcNormal(p: vec3f) -> vec3f {
    let eps = 2.0 / f32(u.volumeSize);
    
    let dx = getField(p + vec3f(eps, 0.0, 0.0)) - getField(p - vec3f(eps, 0.0, 0.0));
    let dy = getField(p + vec3f(0.0, eps, 0.0)) - getField(p - vec3f(0.0, eps, 0.0));
    let dz = getField(p + vec3f(0.0, 0.0, eps)) - getField(p - vec3f(0.0, 0.0, eps));
    
    let n = vec3f(dx, dy, dz);
    let len = length(n);
    if (len < 0.0001) {
        return vec3f(0.0, 1.0, 0.0);
    }
    
    return n / len;
}

// Compute outward normal for bounding shape at position p
fn calcBoundaryNormal(p: vec3f) -> vec3f {
    if (u.shape == 0) {
        // Cube: normal points outward from nearest face
        let absP = abs(p);
        if (absP.x > absP.y && absP.x > absP.z) {
            return vec3f(sign(p.x), 0.0, 0.0);
        } else if (absP.y > absP.z) {
            return vec3f(0.0, sign(p.y), 0.0);
        } else {
            return vec3f(0.0, 0.0, sign(p.z));
        }
    } else {
        // Sphere: normal is just the normalized position
        return normalize(p);
    }
}

// Ray-box intersection (cube shape)
fn intersectBox(ro: vec3f, rd: vec3f) -> vec2f {
    let invRd = 1.0 / rd;
    let t0 = (-1.0 - ro) * invRd;
    let t1 = (1.0 - ro) * invRd;
    let tmin = min(t0, t1);
    let tmax = max(t0, t1);
    let tEnter = max(max(tmin.x, tmin.y), tmin.z);
    let tExit = min(min(tmax.x, tmax.y), tmax.z);
    
    if (tEnter > tExit || tExit < 0.0) {
        return vec2f(-1.0);
    }
    return vec2f(tEnter, tExit);
}

// Ray-sphere intersection (radius 1 centered at origin)
fn intersectSphere(ro: vec3f, rd: vec3f) -> vec2f {
    let b = dot(ro, rd);
    let c = dot(ro, ro) - 1.0;
    let disc = b * b - c;
    
    if (disc < 0.0) {
        return vec2f(-1.0);
    }
    
    let sqrtDisc = sqrt(disc);
    let tEnter = -b - sqrtDisc;
    let tExit = -b + sqrtDisc;
    
    if (tExit < 0.0) {
        return vec2f(-1.0);
    }
    return vec2f(tEnter, tExit);
}

// Get ray bounds based on selected shape
fn getRayBounds(ro: vec3f, rd: vec3f) -> vec2f {
    var t: vec2f;
    
    if (u.shape == 0) {
        t = intersectBox(ro, rd);
    } else {
        t = intersectSphere(ro, rd);
    }
    
    if (t.x < 0.0 && t.y < 0.0) {
        return vec2f(-1.0);
    }
    
    // Apply near clip (handles camera inside volume)
    t.x = max(t.x, NEAR_CLIP);
    
    return t;
}

// Isosurface hit result
struct IsoHit {
    dist: f32,
    pos: vec3f,
    hit: bool,
    atBoundary: bool,  // true if hit at bounding shape edge, not isosurface
}

// Raymarching with bisection refinement
fn raymarch(ro: vec3f, rd: vec3f) -> IsoHit {
    var result: IsoHit;
    result.hit = false;
    result.dist = -1.0;
    result.pos = vec3f(0.0);
    result.atBoundary = false;
    
    let bounds = getRayBounds(ro, rd);
    if (bounds.x < 0.0) {
        return result;
    }
    
    let tStart = bounds.x;
    let tEnd = bounds.y;
    
    // Step size based on volume resolution
    let stepSize = 1.5 / f32(u.volumeSize);
    
    // March through volume
    var t = tStart;
    var prevField = getField(ro + rd * t);
    
    // If we start inside solid, hit immediately at boundary
    if (prevField < 0.0) {
        result.hit = true;
        result.dist = tStart;
        result.pos = ro + rd * tStart;
        result.atBoundary = true;
        return result;
    }
    
    for (var i = 0; i < MAX_STEPS; i++) {
        t += stepSize;
        if (t > tEnd) {
            break;
        }
        
        let p = ro + rd * t;
        
        // For bounded shapes, check if still in bounds
        if (u.shape == 0) {
            // Cube bounds check
            if (any(p < vec3f(-1.0)) || any(p > vec3f(1.0))) {
                break;
            }
        } else if (u.shape == 1) {
            // Sphere bounds check
            if (dot(p, p) > 1.0) {
                break;
            }
        }
        
        let field = getField(p);
        
        // Check for sign change (threshold crossing)
        if (prevField * field < 0.0) {
            // Found crossing - refine with bisection
            var tLo = t - stepSize;
            var tHi = t;
            var bisectPrevField = prevField;
            
            for (var j = 0; j < 8; j++) {
                let tMid = (tLo + tHi) * 0.5;
                let fMid = getField(ro + rd * tMid);
                
                if (bisectPrevField * fMid < 0.0) {
                    tHi = tMid;
                } else {
                    tLo = tMid;
                    bisectPrevField = fMid;
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
fn applyLighting(baseColor: vec3f, n_in: vec3f, rd: vec3f, worldLightDir: vec3f) -> vec3f {
    let lightDir = normalize(worldLightDir);
    let viewDir = -rd;
    
    // Ensure normal faces the camera
    var n = n_in;
    if (dot(n, viewDir) < 0.0) {
        n = -n;
    }
    
    // Ambient lighting
    let ambient = u.ambientColor * baseColor;
    
    // Diffuse lighting (Lambertian)
    let diffuseFactor = max(dot(n, lightDir), 0.0);
    let diffuse = u.diffuseColor * diffuseFactor * baseColor * u.diffuseIntensity;
    
    // Specular lighting (Blinn-Phong)
    let halfDir = normalize(lightDir + viewDir);
    let specAngle = max(dot(halfDir, n), 0.0);
    let specularFactor = pow(specAngle, u.shininess);
    let specular = u.specularColor * specularFactor * u.specularIntensity;
    
    // Fresnel rim lighting
    let rim = pow(1.0 - max(dot(n, viewDir), 0.0), u.rimPower);
    let rimLight = vec3f(rim) * u.rimIntensity;
    
    return ambient + diffuse + specular + rimLight;
}

// Shading - uses RGB from volume for coloring
fn shade(p: vec3f, n: vec3f, rd: vec3f, worldLightDir: vec3f) -> vec3f {
    let volColor = sampleVolume(p);
    var baseColor = volColor.rgb;
    
    // If volume appears grayscale, use neutral gray
    let colorVariance = length(volColor.rgb - vec3f(volColor.r));
    if (colorVariance < 0.01) {
        baseColor = vec3f(0.75);
    }
    
    return applyLighting(baseColor, n, rd, worldLightDir);
}

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOutput {
    var res = u.resolution;
    if (res.x < 1.0) {
        res = vec2f(1024.0, 1024.0);
    }
    
    let fragCoord = input.position.xy;
    let uv = (fragCoord - 0.5 * res) / res.y;
    
    // Camera setup - fixed position, volume rotates
    // Scale camera position from 0-1 UI range to world coords
    let ro = u.cameraPosition * 3.5;
    
    // Camera looks at origin; handle case when at origin
    var forward: vec3f;
    if (length(ro) < 0.001) {
        forward = vec3f(0.0, 0.0, -1.0);  // Default: look into volume
    } else {
        forward = normalize(-ro);  // Look toward origin
    }
    var worldUp = vec3f(0.0, 1.0, 0.0);
    // Handle looking straight up/down
    if (abs(dot(forward, worldUp)) > 0.999) {
        worldUp = vec3f(0.0, 0.0, 1.0);
    }
    let right = normalize(cross(worldUp, forward));
    let up = cross(forward, right);
    
    let rd = normalize(forward + uv.x * right + uv.y * up);
    
    // Light direction is fixed in world space (not view space)
    let worldLightDir = normalize(u.lightDirection);
    
    // Rotate ray into volume space (volume rotates, so we inverse-rotate the ray)
    let angle = -u.time * TAU * f32(u.orbitSpeed);  // Negative for inverse
    let c = cos(angle);
    let s = sin(angle);
    // Rotation around Y axis
    let roVol = vec3f(ro.x * c + ro.z * s, ro.y, -ro.x * s + ro.z * c);
    let rdVol = vec3f(rd.x * c + rd.z * s, rd.y, -rd.x * s + rd.z * c);
    
    var color: vec3f;
    var normal = vec3f(0.0, 0.0, 1.0);
    var depth = 1.0;
    var alpha = 1.0;
    
    let hit = raymarch(roVol, rdVol);
    if (hit.hit) {
        if (hit.atBoundary) {
            normal = calcBoundaryNormal(hit.pos);
        } else {
            normal = calcNormal(hit.pos);
        }
        // Rotate normal back to world space
        normal = vec3f(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
        // Use world-space rd for consistent lighting (normal is in world space)
        color = shade(hit.pos, normal, rd, worldLightDir);
        depth = hit.dist / MAX_DIST;
    } else {
        color = u.bgColor;
        alpha = u.bgAlpha;
    }
    
    // Gamma correction
    color = pow(color, vec3f(1.0 / 2.2));
    
    var output: FragmentOutput;
    output.color = vec4f(color, alpha);
    output.geo = vec4f(normal * 0.5 + 0.5, depth);
    return output;
}
