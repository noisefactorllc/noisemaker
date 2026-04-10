// Flythrough3D Precompute - WGSL
// Orbital path through fractal interior

@group(0) @binding(0) var<uniform> time: f32;
@group(0) @binding(1) var<uniform> volumeSize: i32;
@group(0) @binding(2) var<uniform> noiseType: i32;
@group(0) @binding(3) var<uniform> power: f32;
@group(0) @binding(4) var<uniform> iterations: i32;
@group(0) @binding(5) var<uniform> bailout: f32;
@group(0) @binding(6) var<uniform> speed: f32;
@group(0) @binding(7) var<uniform> voiSize: f32;
@group(0) @binding(8) var<uniform> seed: f32;

const SAFETY_RADIUS: f32 = 0.08;
const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586;

// ============================================================================
// FLYTHROUGH ENGINE - Orbital path through fractal interior
// ============================================================================

fn hash(n: f32) -> f32 {
    return fract(sin(n + seed) * 43758.5453123);
}

// ============================================================================
// ORBIT PATH GENERATION
// ============================================================================

fn trefoilKnot(t: f32, scale: f32) -> vec3f {
    let p = 2.0;
    let q = 3.0;
    let r = 0.5 + 0.2 * cos(q * t);
    return scale * vec3f(
        r * cos(p * t),
        r * sin(p * t),
        0.3 * sin(q * t)
    );
}

fn tiltedOrbit(t: f32, scale: f32) -> vec3f {
    let tilt = 0.4;
    
    let a = 1.0;
    let b = 0.7;
    var pos = vec3f(
        a * cos(t),
        b * sin(t),
        0.0
    );
    
    let c = cos(tilt);
    let s = sin(tilt);
    pos = vec3f(pos.x, pos.y * c - pos.z * s, pos.y * s + pos.z * c);
    
    return scale * pos;
}

fn lissajousOrbit(t: f32, scale: f32) -> vec3f {
    let fx = 1.0;
    let fy = 1.618;
    let fz = 2.0;
    let px = 0.0;
    let py = PI * 0.5;
    let pz = PI * 0.25;
    
    return scale * vec3f(
        sin(fx * t + px),
        sin(fy * t + py) * 0.6,
        sin(fz * t + pz) * 0.4
    );
}

fn getOrbitPosition(t: f32) -> vec3f {
    let orbitScale = 0.7;
    let orbitType = i32(seed * 3.0) % 3;
    
    if (orbitType == 0) {
        return trefoilKnot(t, orbitScale);
    } else if (orbitType == 1) {
        return tiltedOrbit(t, orbitScale);
    } else {
        return lissajousOrbit(t, orbitScale);
    }
}

fn getOrbitTangent(t: f32) -> vec3f {
    let dt = 0.01;
    let p0 = getOrbitPosition(t);
    let p1 = getOrbitPosition(t + dt);
    return normalize(p1 - p0);
}

fn getWobbleOffset(t: f32, tangent: vec3f) -> vec3f {
    var up = vec3f(0.0, 1.0, 0.0);
    if (abs(dot(tangent, up)) > 0.99) {
        up = vec3f(1.0, 0.0, 0.0);
    }
    let right = normalize(cross(tangent, up));
    let realUp = normalize(cross(right, tangent));
    
    let wobbleAmp = 0.15;
    let wx = sin(t * 2.7 + seed * PI) * wobbleAmp;
    let wy = sin(t * 1.9 + seed * TAU) * wobbleAmp * 0.7;
    
    return right * wx + realUp * wy;
}

// ============================================================================
// CAMERA STATE
// ============================================================================

struct CameraState {
    pos: vec3f,
    dir: vec3f,
    up: vec3f,
}

fn getCameraState(t: f32) -> CameraState {
    let orbitTime = t * speed * 0.3;
    
    let orbitPos = getOrbitPosition(orbitTime);
    let tangent = getOrbitTangent(orbitTime);
    let wobble = getWobbleOffset(orbitTime, tangent);
    let pos = orbitPos + wobble;
    
    let dir = tangent;
    
    let worldUp = vec3f(0.0, 1.0, 0.0);
    var right = normalize(cross(worldUp, dir));
    var up = normalize(cross(dir, right));
    
    let roll = sin(orbitTime * 0.5) * 0.1;
    let rollRight = right * cos(roll) + up * sin(roll);
    up = normalize(cross(rollRight, dir));
    
    return CameraState(pos, dir, up);
}

// ============================================================================
// FRACTAL DISTANCE ESTIMATORS
// ============================================================================

struct FractalResult {
    dist: f32,
    trap: f32,
    iterRatio: f32,
}

fn mandelbulb(pos: vec3f, n: f32, maxIter: i32, bail: f32) -> FractalResult {
    var z = pos;
    var dr = 1.0;
    var r = 0.0;
    var trap = 1e10;
    var iter = 0.0;
    
    for (var i = 0; i < maxIter; i++) {
        r = length(z);
        if (r > bail) { break; }
        
        trap = min(trap, r);
        
        let theta = acos(z.z / r);
        let phi = atan2(z.y, z.x);
        
        dr = pow(r, n - 1.0) * n * dr + 1.0;
        
        let zr = pow(r, n);
        let newTheta = theta * n;
        let newPhi = phi * n;
        
        z = zr * vec3f(
            sin(newTheta) * cos(newPhi),
            sin(newTheta) * sin(newPhi),
            cos(newTheta)
        );
        z += pos;
        
        iter += 1.0;
    }
    
    let dist = 0.5 * log(r) * r / dr;
    return FractalResult(dist, trap, iter / f32(maxIter));
}

fn boxFold(z: vec3f, foldLimit: f32) -> vec3f {
    return clamp(z, vec3f(-foldLimit), vec3f(foldLimit)) * 2.0 - z;
}

fn mandelbox(pos: vec3f, scale: f32, maxIter: i32, bail: f32) -> FractalResult {
    var z = pos;
    var dr = 1.0;
    var trap = 1e10;
    var iter = 0.0;
    
    let foldLimit = 1.0;
    let minRadius2 = 0.25;
    let fixedRadius2 = 1.0;
    
    for (var i = 0; i < maxIter; i++) {
        z = boxFold(z, foldLimit);
        
        let r2 = dot(z, z);
        if (r2 < minRadius2) {
            let factor = fixedRadius2 / minRadius2;
            z *= factor;
            dr *= factor;
        } else if (r2 < fixedRadius2) {
            let factor = fixedRadius2 / r2;
            z *= factor;
            dr *= factor;
        }
        
        z = z * scale + pos;
        dr = dr * abs(scale) + 1.0;
        
        let planeTrap = min(min(abs(z.x), abs(z.y)), abs(z.z));
        trap = min(trap, planeTrap);
        
        iter += 1.0;
        
        if (length(z) > bail) { break; }
    }
    
    let r = length(z);
    let dist = r / abs(dr);
    return FractalResult(dist, trap, iter / f32(maxIter));
}

fn computeFractal(p: vec3f) -> FractalResult {
    if (noiseType == 0) {
        return mandelbulb(p, power, iterations, bailout);
    } else {
        return mandelbox(p, power, iterations, bailout);
    }
}

fn computeGradient(p: vec3f, eps: f32) -> vec3f {
    let d0 = computeFractal(p).dist;
    let dx = computeFractal(p + vec3f(eps, 0.0, 0.0)).dist;
    let dy = computeFractal(p + vec3f(0.0, eps, 0.0)).dist;
    let dz = computeFractal(p + vec3f(0.0, 0.0, eps)).dist;
    return vec3f(dx - d0, dy - d0, dz - d0) / eps;
}

// ============================================================================
// COLLISION AVOIDANCE
// ============================================================================

fn applyCollisionAvoidance(pos: vec3f) -> vec3f {
    let fr = computeFractal(pos);
    
    if (fr.dist < SAFETY_RADIUS) {
        let grad = computeGradient(pos, 0.01);
        let pushDir = normalize(grad + vec3f(1e-6));
        let pushDist = SAFETY_RADIUS - fr.dist;
        return pos + pushDir * pushDist * 1.5;
    }
    
    return pos;
}

// ============================================================================
// MAIN
// ============================================================================

struct FragmentOutput {
    @location(0) color: vec4f,
    @location(1) geo: vec4f,
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> FragmentOutput {
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    
    let pixelCoord = vec2i(fragCoord.xy);
    let vx = pixelCoord.x;
    let vy = pixelCoord.y % volSize;
    let vz = pixelCoord.y / volSize;
    
    if (vx >= volSize || vy >= volSize || vz >= volSize) {
        return FragmentOutput(
            vec4f(0.0),
            vec4f(0.5, 0.5, 0.5, 0.0)
        );
    }
    
    // Get camera state
    let cam = getCameraState(time);
    
    // Apply collision avoidance
    let camPos = applyCollisionAvoidance(cam.pos);
    
    // Build camera basis
    let camRight = normalize(cross(cam.dir, cam.up));
    let camUp = normalize(cross(camRight, cam.dir));
    
    // Convert voxel coords to normalized coords
    let normalizedCoord = (vec3f(f32(vx), f32(vy), f32(vz)) / (volSizeF - 1.0)) * 2.0 - 1.0;
    
    // VOI centered on camera
    let halfExtent = voiSize * 0.5;
    let voiOffset = cam.dir * halfExtent;
    
    let worldPos = camPos + voiOffset
                 + camRight * normalizedCoord.x * halfExtent
                 + camUp * normalizedCoord.y * halfExtent
                 + cam.dir * normalizedCoord.z * halfExtent;
    
    // Compute fractal
    let fr = computeFractal(worldPos);
    
    // Distance to density mapping
    let dist = fr.dist;
    let normalizedDist = 1.0 - clamp(dist * 2.0 + 0.5, 0.0, 1.0);
    
    let trap = clamp(fr.trap * 0.5, 0.0, 1.0);
    let iterRatio = fr.iterRatio;
    
    // Compute normal
    let eps = 0.02;
    let gradient = computeGradient(worldPos, eps);
    let normal = normalize(gradient + vec3f(1e-6));
    
    return FragmentOutput(
        vec4f(normalizedDist, trap, iterRatio, 1.0),
        vec4f(normal * 0.5 + 0.5, normalizedDist)
    );
}
