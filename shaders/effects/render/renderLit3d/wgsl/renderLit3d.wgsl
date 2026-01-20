/*
 * Universal 3D volume renderer with advanced lighting (WGSL)
 * 
 * This shader provides common raymarching logic with configurable lighting.
 * It supports both isosurface (smooth) and voxel (blocky) rendering modes.
 * 
 * Lighting includes: diffuse, specular (Blinn-Phong), ambient, and rim lighting.
 */

// Consolidated uniforms struct to stay within WebGPU binding limits
struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    threshold: f32,
    bgColor: vec3<f32>,
    bgAlpha: f32,
    lightDirection: vec3<f32>,
    diffuseIntensity: f32,
    diffuseColor: vec3<f32>,
    specularIntensity: f32,
    specularColor: vec3<f32>,
    shininess: f32,
    ambientColor: vec3<f32>,
    rimIntensity: f32,
    rimPower: f32,
    invert: i32,
    volumeSize: i32,
    filtering: i32,
    orbitSpeed: i32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var volumeCache: texture_2d<f32>;

const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.141592653589793;
const MAX_STEPS: i32 = 256;
const MAX_DIST: f32 = 10.0;

// MRT output structure for color and geometry buffer
struct FragmentOutput {
    @location(0) color: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

// Convert 3D volume coordinates to 2D atlas texel coordinates
fn volumeToAtlas(x: i32, y: i32, z: i32, volSize: i32) -> vec2<i32> {
    return vec2<i32>(x, y + z * volSize);
}

// Sample volume at integer voxel coordinates (for voxel mode)
fn sampleVoxel(voxel: vec3<i32>) -> vec4<f32> {
    let volSize = u.volumeSize;
    let clamped = clamp(voxel, vec3<i32>(0), vec3<i32>(volSize - 1));
    return textureLoad(volumeCache, volumeToAtlas(clamped.x, clamped.y, clamped.z, volSize), 0);
}

// Sample the cached 3D volume with trilinear interpolation
// World position p is in [-1, 1]^3 (bounding box coordinates)
fn sampleVolume(worldPos: vec3<f32>) -> vec4<f32> {
    let volSize = u.volumeSize;
    let volSizeF = f32(volSize);
    
    // Convert world position [-1, 1] to normalized volume coords [0, 1]
    var uvw = worldPos * 0.5 + 0.5;
    uvw = clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0));
    
    // Convert to texel coordinates
    let texelPos = uvw * (volSizeF - 1.0);
    let texelFloor = floor(texelPos);
    let frac = texelPos - texelFloor;
    
    let i0 = vec3<i32>(texelFloor);
    let i1 = min(i0 + 1, vec3<i32>(volSize - 1));
    
    // Trilinear filtering - load 8 corners
    let c000 = textureLoad(volumeCache, volumeToAtlas(i0.x, i0.y, i0.z, volSize), 0);
    let c100 = textureLoad(volumeCache, volumeToAtlas(i1.x, i0.y, i0.z, volSize), 0);
    let c010 = textureLoad(volumeCache, volumeToAtlas(i0.x, i1.y, i0.z, volSize), 0);
    let c110 = textureLoad(volumeCache, volumeToAtlas(i1.x, i1.y, i0.z, volSize), 0);
    let c001 = textureLoad(volumeCache, volumeToAtlas(i0.x, i0.y, i1.z, volSize), 0);
    let c101 = textureLoad(volumeCache, volumeToAtlas(i1.x, i0.y, i1.z, volSize), 0);
    let c011 = textureLoad(volumeCache, volumeToAtlas(i0.x, i1.y, i1.z, volSize), 0);
    let c111 = textureLoad(volumeCache, volumeToAtlas(i1.x, i1.y, i1.z, volSize), 0);
    
    // Trilinear interpolation
    let c00 = mix(c000, c100, frac.x);
    let c10 = mix(c010, c110, frac.x);
    let c01 = mix(c001, c101, frac.x);
    let c11 = mix(c011, c111, frac.x);
    
    let c0 = mix(c00, c10, frac.y);
    let c1 = mix(c01, c11, frac.y);
    
    return mix(c0, c1, frac.z);
}

// Get the scalar field value at a point (what we're finding the isosurface of)
// Convention: HIGH values = SOLID, field < 0 = inside solid
fn getField(p: vec3<f32>) -> f32 {
    var val = sampleVolume(p).r;
    // Invert volume: invert the density so empty space becomes solid and vice versa
    if (u.invert == 1) {
        val = 1.0 - val;
    }
    return u.threshold - val;
}

// Check if a voxel is solid (above threshold - high values = solid)
fn isVoxelSolid(voxel: vec3<i32>) -> bool {
    var val = sampleVoxel(voxel).r;
    // Invert volume: invert the density so empty space becomes solid and vice versa
    if (u.invert == 1) {
        val = 1.0 - val;
    }
    return val > u.threshold;
}

// Convert world position to voxel coordinates
fn worldToVoxel(worldPos: vec3<f32>) -> vec3<i32> {
    let volSize = u.volumeSize;
    let uvw = worldPos * 0.5 + 0.5;  // [-1,1] -> [0,1]
    return vec3<i32>(floor(uvw * f32(volSize)));
}

// Convert voxel coordinates to world position (center of voxel)
fn voxelToWorld(voxel: vec3<i32>) -> vec3<f32> {
    let volSize = u.volumeSize;
    let uvw = (vec3<f32>(voxel) + 0.5) / f32(volSize);  // center of voxel in [0,1]
    return uvw * 2.0 - 1.0;  // [0,1] -> [-1,1]
}

// Voxel hit result
struct VoxelHit {
    dist: f32,
    normal: vec3<f32>,
    voxel: vec3<i32>,
}

// DDA voxel traversal - returns hit distance and face normal
fn voxelTrace(ro: vec3<f32>, rd: vec3<f32>) -> VoxelHit {
    var result: VoxelHit;
    result.dist = -1.0;
    result.normal = vec3<f32>(0.0);
    result.voxel = vec3<i32>(0);
    
    let volSize = u.volumeSize;
    let voxelSize = 2.0 / f32(volSize);  // world-space size of one voxel
    
    // Ray-box intersection with the volume bounds [-1, 1]
    let invRd = 1.0 / rd;
    let t0 = (-1.0 - ro) * invRd;
    let t1 = (1.0 - ro) * invRd;
    let tminV = min(t0, t1);
    let tmaxV = max(t0, t1);
    let tEnter = max(max(tminV.x, tminV.y), tminV.z);
    let tExit = min(min(tmaxV.x, tmaxV.y), tmaxV.z);
    
    if (tEnter > tExit || tExit < 0.0) {
        return result;  // No intersection with volume
    }
    
    // Start position (slightly inside the volume)
    var tStart = max(tEnter + 0.001, 0.0);
    let pos = ro + rd * tStart;
    
    // Current voxel
    var voxel = worldToVoxel(pos);
    voxel = clamp(voxel, vec3<i32>(0), vec3<i32>(volSize - 1));
    
    // Step direction
    let step = vec3<i32>(sign(rd));
    
    // Distance to next voxel boundary in each axis
    let voxelBounds = voxelToWorld(voxel + max(step, vec3<i32>(0)));
    var tMaxVec = (voxelBounds - ro) * invRd;
    
    // Distance to cross one voxel in each axis
    let tDelta = abs(vec3<f32>(voxelSize) * invRd);
    
    // Traverse voxels
    var lastNormal = vec3<f32>(0.0);
    for (var i: i32 = 0; i < MAX_STEPS * 2; i = i + 1) {
        // Check if current voxel is solid
        if (voxel.x >= 0 && voxel.x < volSize &&
            voxel.y >= 0 && voxel.y < volSize &&
            voxel.z >= 0 && voxel.z < volSize) {
            
            if (isVoxelSolid(voxel)) {
                // Hit! 
                result.dist = tStart;
                result.normal = lastNormal;
                result.voxel = voxel;
                
                // If this is the first voxel, compute entry normal
                if (lastNormal.x == 0.0 && lastNormal.y == 0.0 && lastNormal.z == 0.0) {
                    if (tminV.x > tminV.y && tminV.x > tminV.z) {
                        result.normal = vec3<f32>(-sign(rd.x), 0.0, 0.0);
                    } else if (tminV.y > tminV.z) {
                        result.normal = vec3<f32>(0.0, -sign(rd.y), 0.0);
                    } else {
                        result.normal = vec3<f32>(0.0, 0.0, -sign(rd.z));
                    }
                }
                return result;
            }
        }
        
        // Step to next voxel (DDA)
        if (tMaxVec.x < tMaxVec.y) {
            if (tMaxVec.x < tMaxVec.z) {
                tStart = tMaxVec.x;
                tMaxVec.x = tMaxVec.x + tDelta.x;
                voxel.x = voxel.x + step.x;
                lastNormal = vec3<f32>(-f32(step.x), 0.0, 0.0);
            } else {
                tStart = tMaxVec.z;
                tMaxVec.z = tMaxVec.z + tDelta.z;
                voxel.z = voxel.z + step.z;
                lastNormal = vec3<f32>(0.0, 0.0, -f32(step.z));
            }
        } else {
            if (tMaxVec.y < tMaxVec.z) {
                tStart = tMaxVec.y;
                tMaxVec.y = tMaxVec.y + tDelta.y;
                voxel.y = voxel.y + step.y;
                lastNormal = vec3<f32>(0.0, -f32(step.y), 0.0);
            } else {
                tStart = tMaxVec.z;
                tMaxVec.z = tMaxVec.z + tDelta.z;
                voxel.z = voxel.z + step.z;
                lastNormal = vec3<f32>(0.0, 0.0, -f32(step.z));
            }
        }
        
        // Check if we've exited the volume
        if (tStart > tExit) { break; }
    }
    
    return result;
}

// Compute smooth normal using central differences on the SDF field
fn calcNormal(p: vec3<f32>) -> vec3<f32> {
    let eps = 2.0 / f32(u.volumeSize);
    
    let dx = getField(p + vec3<f32>(eps, 0.0, 0.0)) - getField(p - vec3<f32>(eps, 0.0, 0.0));
    let dy = getField(p + vec3<f32>(0.0, eps, 0.0)) - getField(p - vec3<f32>(0.0, eps, 0.0));
    let dz = getField(p + vec3<f32>(0.0, 0.0, eps)) - getField(p - vec3<f32>(0.0, 0.0, eps));
    
    var n = vec3<f32>(dx, dy, dz);
    
    let len = length(n);
    if (len < 0.0001) { return vec3<f32>(0.0, 1.0, 0.0); }
    
    return n / len;
}

// Isosurface hit result
struct IsoHit {
    dist: f32,
    pos: vec3<f32>,
    hit: bool,
}

// Analytic isosurface raymarching with bisection refinement
fn isosurfaceTrace(ro: vec3<f32>, rd: vec3<f32>) -> IsoHit {
    var result: IsoHit;
    result.hit = false;
    result.dist = -1.0;
    result.pos = vec3<f32>(0.0);
    
    let invRd = 1.0 / rd;
    let t0 = (-1.0 - ro) * invRd;
    let t1 = (1.0 - ro) * invRd;
    let tminV = min(t0, t1);
    let tmaxV = max(t0, t1);
    let tEnter = max(max(tminV.x, tminV.y), tminV.z);
    let tExit = min(min(tmaxV.x, tmaxV.y), tmaxV.z);
    
    if (tEnter > tExit || tExit < 0.0) { return result; }
    
    let tStart = max(tEnter, 0.0);
    let stepSize = 1.5 / f32(u.volumeSize);
    
    var t = tStart;
    var prevField = getField(ro + rd * t);
    
    // If we start inside solid (e.g., inverted volume), hit the bounding box surface
    if (prevField < 0.0) {
        result.hit = true;
        result.dist = tStart;
        result.pos = ro + rd * tStart;
        return result;
    }
    
    for (var i: i32 = 0; i < MAX_STEPS; i = i + 1) {
        t = t + stepSize;
        if (t > tExit) { break; }
        
        let p = ro + rd * t;
        let field = getField(p);
        
        if (prevField * field < 0.0) {
            var tLo = t - stepSize;
            var tHi = t;
            var pf = prevField;
            
            for (var j: i32 = 0; j < 8; j = j + 1) {
                let tMid = (tLo + tHi) * 0.5;
                let fMid = getField(ro + rd * tMid);
                
                if (pf * fMid < 0.0) {
                    tHi = tMid;
                } else {
                    tLo = tMid;
                    pf = fMid;
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
fn applyLighting(baseColor: vec3<f32>, n: vec3<f32>, rd: vec3<f32>) -> vec3<f32> {
    // Normalize light direction
    let lightDir = normalize(u.lightDirection);
    
    // Calculate view direction (opposite of ray direction)
    let viewDir = -rd;
    
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
    let rimLight = vec3<f32>(rim) * u.rimIntensity;
    
    // Combine lighting components
    return ambient + diffuse + specular + rimLight;
}

// Shading for smooth isosurface
fn shade(p: vec3<f32>, rd: vec3<f32>) -> vec3<f32> {
    let n = calcNormal(p);
    
    // Use RGB from volume for coloring
    let volColor = sampleVolume(p);
    var baseColor = volColor.rgb;
    
    // If volume appears grayscale (R≈G≈B), use a neutral gray
    let colorVariance = length(volColor.rgb - vec3<f32>(volColor.r));
    if (colorVariance < 0.01) {
        baseColor = vec3<f32>(0.75);
    }
    
    return applyLighting(baseColor, n, rd);
}

// Voxel shading with flat face normals
fn shadeVoxel(p: vec3<f32>, rd: vec3<f32>, n: vec3<f32>, voxel: vec3<i32>) -> vec3<f32> {
    // Use RGB from volume for coloring
    let volColor = sampleVoxel(voxel);
    var baseColor = volColor.rgb;
    
    // If volume appears grayscale, apply face-based shading variation
    let colorVariance = length(volColor.rgb - vec3<f32>(volColor.r));
    if (colorVariance < 0.01) {
        let faceShade = abs(n.x) * 0.9 + abs(n.y) * 1.0 + abs(n.z) * 0.85;
        baseColor = vec3<f32>(0.7 * faceShade);
    }
    
    return applyLighting(baseColor, n, rd);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragmentOutput {
    var res = u.resolution;
    if (res.x < 1.0) { res = vec2<f32>(1024.0, 1024.0); }
    
    let uv = (position.xy - 0.5 * res) / res.y;
    let uvFlipped = vec2<f32>(uv.x, -uv.y);
    
    let camAngle = u.time * TAU * f32(u.orbitSpeed);
    let camDist: f32 = 3.5;
    let ro = vec3<f32>(sin(camAngle) * camDist, 0.5, cos(camAngle) * camDist);
    let lookAt = vec3<f32>(0.0);
    
    let forward = normalize(lookAt - ro);
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward));
    let up = cross(forward, right);
    
    let rd = normalize(forward + uvFlipped.x * right + uvFlipped.y * up);
    
    var color: vec3<f32>;
    var normal = vec3<f32>(0.0, 0.0, 1.0);
    var depth: f32 = 1.0;
    var alpha: f32 = 1.0;
    
    if (u.filtering == 1) {
        let hit = voxelTrace(ro, rd);
        if (hit.dist > 0.0) {
            let p = ro + rd * hit.dist;
            color = shadeVoxel(p, rd, hit.normal, hit.voxel);
            normal = hit.normal;
            depth = hit.dist / MAX_DIST;
        } else {
            color = u.bgColor;
            alpha = u.bgAlpha;
        }
    } else {
        let hit = isosurfaceTrace(ro, rd);
        if (hit.hit) {
            color = shade(hit.pos, rd);
            normal = calcNormal(hit.pos);
            depth = hit.dist / MAX_DIST;
        } else {
            color = u.bgColor;
            alpha = u.bgAlpha;
        }
    }
    
    color = pow(color, vec3<f32>(1.0 / 2.2));
    
    var output: FragmentOutput;
    output.color = vec4<f32>(color, alpha);
    output.geoOut = vec4<f32>(normal * 0.5 + 0.5, depth);
    return output;
}
