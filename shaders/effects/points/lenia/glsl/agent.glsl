#version 300 es
precision highp float;
precision highp int;

/**
 * Particle Lenia Agent Shader
 *
 * Implements the Particle Lenia dynamics:
 * - Each particle computes the Lenia field U from all nearby particles
 * - Growth field G selects optimal density
 * - Repulsion R prevents particle overlap
 * - Particles move down the gradient of E = R - G
 *
 * Based on: https://google-research.github.io/self-organising-systems/particle-lenia/
 */

// Standard uniforms
uniform vec2 resolution;
uniform float time;

// Lenia parameters
uniform float muK;         // Kernel center (shell radius)
uniform float sigmaK;      // Kernel width
uniform float muG;         // Target density for growth
uniform float sigmaG;      // Growth tolerance
uniform float repulsion;   // Repulsion strength
uniform float dt;          // Time step
uniform float searchRadius; // Optimization: max distance to consider
uniform bool resetState;

// Input state from pipeline (from pointsEmit)
uniform sampler2D xyzTex;    // [x, y, z, alive]
uniform sampler2D velTex;    // [vx, vy, age, seed]
uniform sampler2D rgbaTex;   // [r, g, b, a]

// Output state (MRT)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

// Constants
const float PI = 3.14159265359;
const float EPSILON = 1e-10;

// Compute kernel weight for normalization
// Approximates integral of K over 2D space for a gaussian shell
float computeKernelWeight(float mu, float sigma) {
    // For a 2D gaussian shell at radius mu with width sigma,
    // the integral is approximately 2*PI*mu * sqrt(PI)*sigma
    return 1.0 / (2.0 * PI * mu * sqrt(PI) * sigma + EPSILON);
}

// Kernel function K(r) - gaussian shell around radius muK
float kernel(float r, float mu, float sigma) {
    float d = (r - mu) / sigma;
    return exp(-d * d);
}

// Growth function G(u) - gaussian peak at target density
float growth(float u, float mu, float sigma) {
    float d = (u - mu) / sigma;
    return exp(-d * d);
}

// Repulsion potential at distance r
// R(r) = (c_rep/2) * max(1-r, 0)²
float repulsionPotential(float r, float cRep) {
    float x = max(1.0 - r, 0.0);
    return cRep * 0.5 * x * x;
}

// Repulsion force magnitude (derivative of potential)
// dR/dr = -c_rep * max(1-r, 0)
float repulsionForce(float r, float cRep) {
    return cRep * max(1.0 - r, 0.0);
}

// Kernel derivative for gradient computation
// dK/dr = -2 * (r - mu) / sigma² * K(r)
float kernelDerivative(float r, float mu, float sigma) {
    float d = (r - mu) / sigma;
    return -2.0 * d / sigma * exp(-d * d);
}

// Growth derivative
// dG/du = -2 * (u - mu) / sigma² * G(u)
float growthDerivative(float u, float mu, float sigma) {
    float d = (u - mu) / sigma;
    return -2.0 * d / sigma * exp(-d * d);
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 stateSize = textureSize(xyzTex, 0);
    int totalParticles = stateSize.x * stateSize.y;

    // Read input state from pipeline
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);

    // Reset state if requested
    if (resetState) {
        outXYZ = vec4(xyz.xy, 0.0, 0.0);  // Keep position, mark as dead for respawn
        outVel = vec4(0.0, 0.0, 0.0, vel.w);  // Clear velocity, keep seed
        outRGBA = rgba;
        return;
    }

    float alive = xyz.w;

    // Pass through dead particles
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vel;
        outRGBA = rgba;
        return;
    }

    // Current particle position in world space (scale from [0,1] to world coords)
    // Use a reasonable world scale based on resolution
    float worldScale = min(resolution.x, resolution.y) * 0.05;
    vec2 pos = xyz.xy * worldScale;

    // Compute kernel weight for normalization
    float wK = computeKernelWeight(muK, sigmaK);

    // Accumulate fields from all other particles
    float U = 0.0;           // Lenia field value at this particle
    vec2 gradU = vec2(0.0);  // Gradient of U
    vec2 gradR = vec2(0.0);  // Gradient of repulsion

    // Sample search: iterate over all particles
    // (In production, spatial hashing would optimize this)
    for (int j = 0; j < stateSize.y; j++) {
        for (int i = 0; i < stateSize.x; i++) {
            // Skip self
            if (i == coord.x && j == coord.y) continue;

            vec4 otherXYZ = texelFetch(xyzTex, ivec2(i, j), 0);

            // Skip dead particles
            if (otherXYZ.w < 0.5) continue;

            vec2 otherPos = otherXYZ.xy * worldScale;
            vec2 diff = pos - otherPos;
            float r = length(diff);

            // Skip if too far (optimization)
            if (r > searchRadius || r < EPSILON) continue;

            vec2 dir = diff / r;  // Normalized direction from other to self

            // Accumulate Lenia field U
            float kVal = kernel(r, muK, sigmaK) * wK;
            U += kVal;

            // Gradient of U (chain rule: dU/dp = dK/dr * dr/dp)
            // dr/dp = dir (unit vector from other to self)
            float dKdr = kernelDerivative(r, muK, sigmaK) * wK;
            gradU += dKdr * dir;

            // Gradient of repulsion potential
            float fRep = repulsionForce(r, repulsion);
            gradR += fRep * dir;
        }
    }

    // Compute growth value and its gradient
    float G = growth(U, muG, sigmaG);
    float dGdU = growthDerivative(U, muG, sigmaG);

    // Gradient of G w.r.t. position: dG/dp = dG/dU * dU/dp
    vec2 gradG = dGdU * gradU;

    // Energy gradient: ∇E = ∇R - ∇G
    // Particles move against the energy gradient: dp/dt = -∇E
    vec2 force = gradG - gradR;  // Note: minus already applied

    // Update position (first-order Euler)
    vec2 newPos = pos + force * dt;

    // Convert back to normalized [0,1] coordinates
    newPos = newPos / worldScale;

    // Wrap to [0,1] bounds (toroidal topology)
    newPos = fract(newPos + 1.0);

    // Store velocity for visualization/diagnostics
    vec2 velocity = force * dt;

    // Update age
    float age = vel.z + 0.016;

    // Output
    outXYZ = vec4(newPos, xyz.z, 1.0);  // Keep z, stay alive
    outVel = vec4(velocity, age, vel.w);  // Store velocity, age, seed
    outRGBA = rgba;  // Color unchanged
}
