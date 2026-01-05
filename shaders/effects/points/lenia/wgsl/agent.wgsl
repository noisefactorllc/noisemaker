// Particle Lenia Agent Shader (WGSL)
//
// Implements the Particle Lenia dynamics:
// - Each particle computes the Lenia field U from all nearby particles
// - Growth field G selects optimal density
// - Repulsion R prevents particle overlap
// - Particles move down the gradient of E = R - G
//
// Based on: https://google-research.github.io/self-organising-systems/particle-lenia/

struct Uniforms {
    resolution: vec2f,
    time: f32,
    muK: f32,
    sigmaK: f32,
    muG: f32,
    sigmaG: f32,
    repulsion: f32,
    dt: f32,
    searchRadius: f32,
    resetState: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(3) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;

struct Outputs {
    @location(0) outXYZ: vec4f,
    @location(1) outVel: vec4f,
    @location(2) outRGBA: vec4f,
}

// Constants
const PI: f32 = 3.14159265359;
const EPSILON: f32 = 1e-10;

// Compute kernel weight for normalization
fn computeKernelWeight(mu: f32, sigma: f32) -> f32 {
    return 1.0 / (2.0 * PI * mu * sqrt(PI) * sigma + EPSILON);
}

// Kernel function K(r) - gaussian shell around radius muK
fn kernel(r: f32, mu: f32, sigma: f32) -> f32 {
    let d = (r - mu) / sigma;
    return exp(-d * d);
}

// Growth function G(u) - gaussian peak at target density
fn growth(uVal: f32, mu: f32, sigma: f32) -> f32 {
    let d = (uVal - mu) / sigma;
    return exp(-d * d);
}

// Repulsion force magnitude (derivative of potential)
fn repulsionForce(r: f32, cRep: f32) -> f32 {
    return cRep * max(1.0 - r, 0.0);
}

// Kernel derivative for gradient computation
fn kernelDerivative(r: f32, mu: f32, sigma: f32) -> f32 {
    let d = (r - mu) / sigma;
    return -2.0 * d / sigma * exp(-d * d);
}

// Growth derivative
fn growthDerivative(uVal: f32, mu: f32, sigma: f32) -> f32 {
    let d = (uVal - mu) / sigma;
    return -2.0 * d / sigma * exp(-d * d);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> Outputs {
    let coord = vec2i(i32(fragCoord.x), i32(fragCoord.y));
    let stateSize = vec2i(textureDimensions(xyzTex, 0));

    // Read input state from pipeline
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);

    // Reset state if requested
    if (u.resetState > 0.5) {
        return Outputs(
            vec4f(xyz.xy, 0.0, 0.0),  // Keep position, mark as dead for respawn
            vec4f(0.0, 0.0, 0.0, vel.w),  // Clear velocity, keep seed
            rgba
        );
    }

    let alive = xyz.w;

    // Pass through dead particles
    if (alive < 0.5) {
        return Outputs(xyz, vel, rgba);
    }

    // Current particle position in world space (scale from [0,1] to world coords)
    let worldScale = min(u.resolution.x, u.resolution.y) * 0.05;
    var pos = xyz.xy * worldScale;

    // Compute kernel weight for normalization
    let wK = computeKernelWeight(u.muK, u.sigmaK);

    // Accumulate fields from all other particles
    var U: f32 = 0.0;           // Lenia field value at this particle
    var gradU = vec2f(0.0);     // Gradient of U
    var gradR = vec2f(0.0);     // Gradient of repulsion

    // Sample search: iterate over all particles
    for (var j = 0; j < stateSize.y; j++) {
        for (var i = 0; i < stateSize.x; i++) {
            // Skip self
            if (i == coord.x && j == coord.y) { continue; }

            let otherXYZ = textureLoad(xyzTex, vec2i(i, j), 0);

            // Skip dead particles
            if (otherXYZ.w < 0.5) { continue; }

            let otherPos = otherXYZ.xy * worldScale;
            let diff = pos - otherPos;
            let r = length(diff);

            // Skip if too far (optimization)
            if (r > u.searchRadius || r < EPSILON) { continue; }

            let dir = diff / r;  // Normalized direction from other to self

            // Accumulate Lenia field U
            let kVal = kernel(r, u.muK, u.sigmaK) * wK;
            U += kVal;

            // Gradient of U (chain rule: dU/dp = dK/dr * dr/dp)
            let dKdr = kernelDerivative(r, u.muK, u.sigmaK) * wK;
            gradU += dKdr * dir;

            // Gradient of repulsion potential
            let fRep = repulsionForce(r, u.repulsion);
            gradR += fRep * dir;
        }
    }

    // Compute growth value and its gradient
    let G = growth(U, u.muG, u.sigmaG);
    let dGdU = growthDerivative(U, u.muG, u.sigmaG);

    // Gradient of G w.r.t. position: dG/dp = dG/dU * dU/dp
    let gradG = dGdU * gradU;

    // Energy gradient: ∇E = ∇R - ∇G
    // Particles move against the energy gradient: dp/dt = -∇E
    let force = gradG - gradR;

    // Update position (first-order Euler)
    var newPos = pos + force * u.dt;

    // Convert back to normalized [0,1] coordinates
    newPos = newPos / worldScale;

    // Wrap to [0,1] bounds (toroidal topology)
    newPos = fract(newPos + vec2f(1.0));

    // Store velocity for visualization/diagnostics
    let velocity = force * u.dt;

    // Update age
    let age = vel.z + 0.016;

    // Output
    return Outputs(
        vec4f(newPos, xyz.z, 1.0),  // Keep z, stay alive
        vec4f(velocity, age, vel.w),  // Store velocity, age, seed
        rgba  // Color unchanged
    );
}
