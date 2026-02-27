// WGSL version – WebGPU
// Precompute pass: generate 3D fractal volume as 2D atlas
@group(0) @binding(0) var<uniform> volumeSize: i32;
@group(0) @binding(1) var<uniform> type: i32;
@group(0) @binding(2) var<uniform> power: f32;
@group(0) @binding(3) var<uniform> iterations: i32;
@group(0) @binding(4) var<uniform> bailout: f32;
@group(0) @binding(5) var<uniform> juliaX: f32;
@group(0) @binding(6) var<uniform> juliaY: f32;
@group(0) @binding(7) var<uniform> juliaZ: f32;

const PI: f32 = 3.141592653589793;

// Mandelbulb distance estimator
// Returns (distance estimate, orbit trap distance, iteration ratio)
fn mandelbulb(pos: vec3<f32>, n: f32, maxIter: i32, bail: f32) -> vec3<f32> {
    var z = pos;
    var dr: f32 = 1.0;
    var r: f32 = 0.0;
    var trap: f32 = 1e10;
    var iter: f32 = 0.0;
    
    for (var i: i32 = 0; i < maxIter; i = i + 1) {
        r = length(z);
        if (r > bail) { break; }
        
        // Orbit trap - distance to origin
        trap = min(trap, r);
        
        // Convert to spherical coordinates
        let theta = acos(z.z / r);
        let phi = atan2(z.y, z.x);
        
        // Scale the running derivative
        dr = pow(r, n - 1.0) * n * dr + 1.0;
        
        // Scale and rotate the point
        let zr = pow(r, n);
        let newTheta = theta * n;
        let newPhi = phi * n;
        
        // Convert back to Cartesian coordinates
        z = zr * vec3<f32>(
            sin(newTheta) * cos(newPhi),
            sin(newTheta) * sin(newPhi),
            cos(newTheta)
        );
        z = z + pos;
        
        iter = iter + 1.0;
    }
    
    // Distance estimator
    let dist = 0.5 * log(r) * r / dr;
    
    return vec3<f32>(dist, trap, iter / f32(maxIter));
}

// Julia Mandelbulb - fixed c point
fn juliaBulb(pos: vec3<f32>, c: vec3<f32>, n: f32, maxIter: i32, bail: f32) -> vec3<f32> {
    var z = pos;
    var dr: f32 = 1.0;
    var r: f32 = 0.0;
    var trap: f32 = 1e10;
    var iter: f32 = 0.0;
    
    for (var i: i32 = 0; i < maxIter; i = i + 1) {
        r = length(z);
        if (r > bail) { break; }
        
        trap = min(trap, r);
        
        let theta = acos(z.z / r);
        let phi = atan2(z.y, z.x);
        
        dr = pow(r, n - 1.0) * n * dr + 1.0;
        
        let zr = pow(r, n);
        let newTheta = theta * n;
        let newPhi = phi * n;
        
        z = zr * vec3<f32>(
            sin(newTheta) * cos(newPhi),
            sin(newTheta) * sin(newPhi),
            cos(newTheta)
        );
        z = z + c;  // Add constant c instead of pos
        
        iter = iter + 1.0;
    }
    
    let dist = 0.5 * log(r) * r / dr;
    return vec3<f32>(dist, trap, iter / f32(maxIter));
}

// Box fold operation for Mandelbox/Mandelcube
fn boxFold(z: vec3<f32>, foldingLimit: f32) -> vec3<f32> {
    return clamp(z, vec3<f32>(-foldingLimit), vec3<f32>(foldingLimit)) * 2.0 - z;
}

// Sphere fold operation for Mandelbox
fn sphereFold(z: vec3<f32>, minRadius: f32, fixedRadius: f32) -> vec3<f32> {
    let r2 = dot(z, z);
    let minR2 = minRadius * minRadius;
    let fixedR2 = fixedRadius * fixedRadius;
    
    if (r2 < minR2) {
        return z * (fixedR2 / minR2);
    } else if (r2 < fixedR2) {
        return z * (fixedR2 / r2);
    }
    return z;
}

// Mandelcube (simplified Mandelbox-like) distance estimator
fn mandelcube(pos: vec3<f32>, scale: f32, maxIter: i32, bail: f32) -> vec3<f32> {
    var z = pos;
    var dr: f32 = 1.0;
    var trap: f32 = 1e10;
    var iter: f32 = 0.0;
    
    let foldingLimit: f32 = 1.0;
    let minRadius: f32 = 0.5;
    let fixedRadius: f32 = 1.0;
    
    for (var i: i32 = 0; i < maxIter; i = i + 1) {
        // Box fold
        z = boxFold(z, foldingLimit);
        
        // Sphere fold
        let r2 = dot(z, z);
        let minR2 = minRadius * minRadius;
        let fixedR2 = fixedRadius * fixedRadius;
        
        if (r2 < minR2) {
            let factor = fixedR2 / minR2;
            z = z * factor;
            dr = dr * factor;
        } else if (r2 < fixedR2) {
            let factor = fixedR2 / r2;
            z = z * factor;
            dr = dr * factor;
        }
        
        // Scale and translate
        z = z * scale + pos;
        dr = dr * abs(scale) + 1.0;
        
        trap = min(trap, length(z));
        iter = iter + 1.0;
        
        if (length(z) > bail) { break; }
    }
    
    let r = length(z);
    let dist = r / abs(dr);
    
    return vec3<f32>(dist, trap, iter / f32(maxIter));
}

// Julia Mandelcube - fixed c point
fn juliaCube(pos: vec3<f32>, c: vec3<f32>, scale: f32, maxIter: i32, bail: f32) -> vec3<f32> {
    var z = pos;
    var dr: f32 = 1.0;
    var trap: f32 = 1e10;
    var iter: f32 = 0.0;
    
    let foldingLimit: f32 = 1.0;
    let minRadius: f32 = 0.5;
    let fixedRadius: f32 = 1.0;
    
    for (var i: i32 = 0; i < maxIter; i = i + 1) {
        z = boxFold(z, foldingLimit);
        
        let r2 = dot(z, z);
        let minR2 = minRadius * minRadius;
        let fixedR2 = fixedRadius * fixedRadius;
        
        if (r2 < minR2) {
            let factor = fixedR2 / minR2;
            z = z * factor;
            dr = dr * factor;
        } else if (r2 < fixedR2) {
            let factor = fixedR2 / r2;
            z = z * factor;
            dr = dr * factor;
        }
        
        z = z * scale + c;  // Add constant c instead of pos
        dr = dr * abs(scale) + 1.0;
        
        trap = min(trap, length(z));
        iter = iter + 1.0;
        
        if (length(z) > bail) { break; }
    }
    
    let r = length(z);
    let dist = r / abs(dr);
    
    return vec3<f32>(dist, trap, iter / f32(maxIter));
}

// MRT output structure for volume cache and geometry buffer
struct FragOutput {
    @location(0) color: vec4<f32>,
    @location(1) geoOut: vec4<f32>,
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> FragOutput {
    let volSize = volumeSize;
    let volSizeF = f32(volSize);
    
    // Atlas is volSize x (volSize * volSize)
    // Pixel (x, y) maps to 3D coordinate (x, y % volSize, y / volSize)
    let pixelCoord = vec2<i32>(position.xy);
    
    let x = pixelCoord.x;
    let y = pixelCoord.y % volSize;
    let z = pixelCoord.y / volSize;
    
    // Bounds check
    if (x >= volSize || y >= volSize || z >= volSize) {
        return FragOutput(vec4<f32>(0.0), vec4<f32>(0.5, 0.5, 0.5, 0.0));
    }
    
    // Convert to normalized 3D coordinates in [-1.5, 1.5] world space
    // Slightly larger than [-1,1] to capture the full fractal
    let p = (vec3<f32>(f32(x), f32(y), f32(z)) / (volSizeF - 1.0) * 2.0 - 1.0) * 1.5;
    
    // Julia constant from uniforms (normalized from -100..100 to -1..1)
    let juliaC = vec3<f32>(juliaX, juliaY, juliaZ) * 0.01;
    
    var result: vec3<f32>;
    
    // Select fractal type
    if (type == 0) {
        // Mandelbulb
        result = mandelbulb(p, power, iterations, bailout);
    } else if (type == 1) {
        // Mandelcube (use power as scale, clamped to reasonable range)
        let scale = clamp(power * 0.25, -3.0, 3.0);
        result = mandelcube(p, scale, iterations, bailout);
    } else if (type == 2) {
        // Julia Bulb
        result = juliaBulb(p, juliaC, power, iterations, bailout);
    } else {
        // Julia Cube
        let scale = clamp(power * 0.25, -3.0, 3.0);
        result = juliaCube(p, juliaC, scale, iterations, bailout);
    }
    
    // result.x = distance estimate (used for threshold)
    // result.y = orbit trap (for coloring)
    // result.z = iteration ratio (for coloring)
    
    // Normalize distance to 0-1 range for storage
    // Small distances = inside/near surface, large = outside
    let dist = result.x;
    let normalizedDist = 1.0 - clamp(dist * 2.0 + 0.5, 0.0, 1.0);
    
    // Normalize trap value
    let trap = clamp(result.y * 0.5, 0.0, 1.0);
    
    // Iteration ratio is already 0-1
    let iterRatio = result.z;
    
    // Compute analytical gradient using finite differences
    let eps = 0.01;
    var dx: vec3<f32>;
    var dy: vec3<f32>;
    var dz: vec3<f32>;
    
    if (type == 0) {
        dx = mandelbulb(p + vec3<f32>(eps, 0.0, 0.0), power, iterations, bailout);
        dy = mandelbulb(p + vec3<f32>(0.0, eps, 0.0), power, iterations, bailout);
        dz = mandelbulb(p + vec3<f32>(0.0, 0.0, eps), power, iterations, bailout);
    } else if (type == 1) {
        let scale = clamp(power * 0.25, -3.0, 3.0);
        dx = mandelcube(p + vec3<f32>(eps, 0.0, 0.0), scale, iterations, bailout);
        dy = mandelcube(p + vec3<f32>(0.0, eps, 0.0), scale, iterations, bailout);
        dz = mandelcube(p + vec3<f32>(0.0, 0.0, eps), scale, iterations, bailout);
    } else if (type == 2) {
        dx = juliaBulb(p + vec3<f32>(eps, 0.0, 0.0), juliaC, power, iterations, bailout);
        dy = juliaBulb(p + vec3<f32>(0.0, eps, 0.0), juliaC, power, iterations, bailout);
        dz = juliaBulb(p + vec3<f32>(0.0, 0.0, eps), juliaC, power, iterations, bailout);
    } else {
        let scale = clamp(power * 0.25, -3.0, 3.0);
        dx = juliaCube(p + vec3<f32>(eps, 0.0, 0.0), juliaC, scale, iterations, bailout);
        dy = juliaCube(p + vec3<f32>(0.0, eps, 0.0), juliaC, scale, iterations, bailout);
        dz = juliaCube(p + vec3<f32>(0.0, 0.0, eps), juliaC, scale, iterations, bailout);
    }
    
    let gradient = vec3<f32>(dx.x - dist, dy.x - dist, dz.x - dist) / eps;
    let normal = normalize(-gradient + vec3<f32>(0.000001));
    
    let color = vec4<f32>(normalizedDist, trap, iterRatio, 1.0);
    let geoOut = vec4<f32>(normal * 0.5 + 0.5, normalizedDist);
    
    return FragOutput(color, geoOut);
}
