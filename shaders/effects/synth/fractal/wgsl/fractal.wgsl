/*
 * WGSL fractal explorer shader
 * 
 * Implements multiple escape-time fractals with smooth iteration coloring:
 * - Mandelbrot (z² + c)
 * - Julia (z² + c with fixed c)
 * - Burning Ship (|Re(z)|² + |Im(z)|² + c)
 * - Tricorn/Mandelbar (conj(z)² + c)
 * - Phoenix (z² + c + p*z_prev)
 * - Newton (Newton-Raphson for z³ - 1)
 */

struct Uniforms {
    // Slot 0: resolution.xy, time, (unused)
    // Slot 1: fractalType, power, iterations, bailout
    // Slot 2: centerX, centerY, zoom, rotation
    // Slot 3: juliaReal, juliaImag, animateJulia, speed
    // Slot 4: outputMode, colorCycles, smoothing, invert
    data: array<vec4<f32>, 5>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// ============================================================================
// Complex number operations
// ============================================================================

// Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex division
fn cdiv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let denom = dot(b, b);
    return vec2<f32>(
        (a.x * b.x + a.y * b.y) / denom,
        (a.y * b.x - a.x * b.y) / denom
    );
}

// Complex power using polar form
fn cpow(z: vec2<f32>, n: f32) -> vec2<f32> {
    let r = length(z);
    let theta = atan2(z.y, z.x);
    let rn = pow(r, n);
    let ntheta = n * theta;
    return vec2<f32>(rn * cos(ntheta), rn * sin(ntheta));
}

// Complex conjugate
fn conj(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(z.x, -z.y);
}

// ============================================================================
// Coordinate transformation
// ============================================================================

fn transformCoords(fragCoord: vec2<f32>, resolution: vec2<f32>, centerX: f32, centerY: f32, zoom: f32, rotation: f32) -> vec2<f32> {
    // Normalize to [-1, 1] with aspect correction
    var uv = (fragCoord - 0.5 * resolution) / min(resolution.x, resolution.y);
    
    // Apply rotation
    let angle = -rotation * TAU;
    let c = cos(angle);
    let s = sin(angle);
    uv = vec2<f32>(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    
    // Apply zoom and center
    uv = uv * (2.5 / zoom) + vec2<f32>(-centerX, centerY);
    
    return uv;
}

// ============================================================================
// Fractal iteration functions
// ============================================================================

// Mandelbrot: z = z² + c, where c = pixel position
fn mandelbrot(c: vec2<f32>, pw: f32, maxIter: i32, bailout: f32, doSmooth: bool) -> vec4<f32> {
    var z = vec2<f32>(0.0, 0.0);
    var i: f32 = 0.0;
    
    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }
        
        z = cpow(z, pw) + c;
        
        if (dot(z, z) > bailout * bailout) { break; }
        i = i + 1.0;
    }
    
    // Smooth iteration count
    var smoothVal = i;
    if (doSmooth && i < f32(maxIter)) {
        let log_zn = log(dot(z, z)) / 2.0;
        let nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4<f32>(smoothVal, length(z), atan2(z.y, z.x), i);
}

// Julia: z = z² + c, where c is fixed, z starts at pixel position
fn julia(z0: vec2<f32>, c: vec2<f32>, pw: f32, maxIter: i32, bailout: f32, doSmooth: bool) -> vec4<f32> {
    var z = z0;
    var i: f32 = 0.0;
    
    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }
        
        z = cpow(z, pw) + c;
        
        if (dot(z, z) > bailout * bailout) { break; }
        i = i + 1.0;
    }
    
    var smoothVal = i;
    if (doSmooth && i < f32(maxIter)) {
        let log_zn = log(dot(z, z)) / 2.0;
        let nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4<f32>(smoothVal, length(z), atan2(z.y, z.x), i);
}

// Burning Ship: z = (|Re(z)| + i|Im(z)|)² + c
fn burningShip(c: vec2<f32>, pw: f32, maxIter: i32, bailout: f32, doSmooth: bool) -> vec4<f32> {
    var z = vec2<f32>(0.0, 0.0);
    var i: f32 = 0.0;
    
    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }
        
        // Take absolute values before squaring
        z = abs(z);
        z = cpow(z, pw) + c;
        
        if (dot(z, z) > bailout * bailout) { break; }
        i = i + 1.0;
    }
    
    var smoothVal = i;
    if (doSmooth && i < f32(maxIter)) {
        let log_zn = log(dot(z, z)) / 2.0;
        let nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4<f32>(smoothVal, length(z), atan2(z.y, z.x), i);
}

// Tricorn (Mandelbar): z = conj(z)² + c
fn tricorn(c: vec2<f32>, pw: f32, maxIter: i32, bailout: f32, doSmooth: bool) -> vec4<f32> {
    var z = vec2<f32>(0.0, 0.0);
    var i: f32 = 0.0;
    
    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }
        
        z = cpow(conj(z), pw) + c;
        
        if (dot(z, z) > bailout * bailout) { break; }
        i = i + 1.0;
    }
    
    var smoothVal = i;
    if (doSmooth && i < f32(maxIter)) {
        let log_zn = log(dot(z, z)) / 2.0;
        let nu = log(log_zn / log(2.0)) / log(pw);
        smoothVal = i + 1.0 - nu;
    }
    
    return vec4<f32>(smoothVal, length(z), atan2(z.y, z.x), i);
}

// Newton fractal for z³ - 1 = 0
fn newton(z0: vec2<f32>, maxIter: i32) -> vec4<f32> {
    var z = z0;
    var i: f32 = 0.0;
    
    // The three roots of z³ - 1
    let root1 = vec2<f32>(1.0, 0.0);
    let root2 = vec2<f32>(-0.5, sqrt(3.0) / 2.0);
    let root3 = vec2<f32>(-0.5, -sqrt(3.0) / 2.0);
    
    let tolerance: f32 = 0.0001;
    var whichRoot: i32 = -1;
    
    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }
        
        // f(z) = z³ - 1
        let z2 = cmul(z, z);
        let z3 = cmul(z2, z);
        let fz = z3 - vec2<f32>(1.0, 0.0);
        
        // f'(z) = 3z²
        let fpz = 3.0 * z2;
        
        // Newton step: z = z - f(z)/f'(z)
        z = z - cdiv(fz, fpz);
        
        // Check convergence to roots
        if (length(z - root1) < tolerance) { whichRoot = 0; break; }
        if (length(z - root2) < tolerance) { whichRoot = 1; break; }
        if (length(z - root3) < tolerance) { whichRoot = 2; break; }
        
        i = i + 1.0;
    }
    
    // Return iteration count, which root (0-2), and angle
    var rootVal: f32 = 0.0;
    if (whichRoot >= 0) {
        rootVal = f32(whichRoot) / 3.0;
    }
    return vec4<f32>(i, rootVal, atan2(z.y, z.x), i);
}

// ============================================================================
// Output mapping
// ============================================================================

fn mapOutput(result: vec4<f32>, mode: i32, maxIter: f32, bailout: f32) -> f32 {
    if (mode == 0) {
        // Iteration count (normalized)
        return result.x / maxIter;
    } else if (mode == 1) {
        // Distance estimate (final |z|, normalized)
        return clamp(result.y / (bailout * 2.0), 0.0, 1.0);
    } else if (mode == 2) {
        // Angle of final z
        return (result.z + PI) / TAU;
    } else if (mode == 3) {
        // Potential: log(log(|z|)) based coloring
        if (result.w >= maxIter) { return 0.0; }
        let potential = log(result.y) / pow(2.0, result.w);
        return clamp(1.0 - log(potential + 1.0), 0.0, 1.0);
    }
    
    return result.x / maxIter;
}

// ============================================================================
// Main
// ============================================================================

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    
    let fractalType = i32(uniforms.data[1].x);
    let power = uniforms.data[1].y;
    let iterations = i32(uniforms.data[1].z);
    let bailout = uniforms.data[1].w;
    
    let centerX = uniforms.data[2].x;
    let centerY = uniforms.data[2].y;
    let zoom = uniforms.data[2].z;
    let rotation = uniforms.data[2].w;
    
    let juliaReal = uniforms.data[3].x;
    let juliaImag = uniforms.data[3].y;
    let animateJulia = uniforms.data[3].z > 0.5;
    let speed = uniforms.data[3].w;
    
    let outputMode = i32(uniforms.data[4].x);
    let colorCycles = uniforms.data[4].y;
    let smoothing = uniforms.data[4].z > 0.5;
    let invert = uniforms.data[4].w > 0.5;
    
    // Transform coordinates
    let z = transformCoords(pos.xy, resolution, centerX, centerY, zoom, rotation);
    
    // Get animated or static Julia constant
    var juliaC = vec2<f32>(juliaReal, juliaImag);
    if (animateJulia) {
        let t = time * speed;
        juliaC = vec2<f32>(
            0.7885 * cos(t * TAU),
            0.7885 * sin(t * TAU)
        );
    }
    
    var result: vec4<f32>;
    
    // Select fractal type
    if (fractalType == 0) {
        result = mandelbrot(z, power, iterations, bailout, smoothing);
    } else if (fractalType == 1) {
        result = julia(z, juliaC, power, iterations, bailout, smoothing);
    } else if (fractalType == 2) {
        result = burningShip(z, power, iterations, bailout, smoothing);
    } else if (fractalType == 3) {
        result = tricorn(z, power, iterations, bailout, smoothing);
    } else if (fractalType == 4) {
        result = newton(z, iterations);
    } else {
        result = mandelbrot(z, power, iterations, bailout, smoothing);
    }
    
    // Check if point is in the set (didn't escape)
    let inSet = result.w >= f32(iterations);
    
    // Map to output value
    var value: f32;
    if (fractalType == 4) {
        // Newton fractal: use root coloring combined with iteration
        let rootColor = result.y;
        let iterColor = 1.0 - result.x / f32(iterations);
        value = rootColor + iterColor * 0.3;
        value = fract(value * colorCycles);
    } else if (inSet) {
        value = 0.0;
    } else {
        value = mapOutput(result, outputMode, f32(iterations), bailout);
        value = fract(value * colorCycles);
    }
    
    // Apply inversion
    if (invert) {
        value = 1.0 - value;
    }
    
    return vec4<f32>(vec3<f32>(value), 1.0);
}
