#version 300 es
precision highp float;

// Agent update pass - samples pre-convolved U field
// Much faster than O(n²) as field is already computed

uniform sampler2D xyzTex;     // Particle positions
uniform sampler2D velTex;     // Particle velocities
uniform sampler2D rgbaTex;    // Particle colors
uniform sampler2D inputTex;   // Chained input, for agent spawn colors
uniform sampler2D fieldTex;   // Pre-convolved U field (from convolve pass)

uniform vec2 resolution;

// Growth parameters
uniform float muG;       // Target density (growth peak)
uniform float sigmaG;    // Growth width

// Repulsion parameters
uniform float repulsion; // Repulsion strength

// Motion parameters
uniform float dt;        // Time step

// MRT outputs
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

uniform sampler2D diffuseTex;
uniform float diffuseActive;

vec4 selectedDiffuse(vec2 uv) {
    ivec2 size = textureSize(diffuseTex, 0);
    ivec2 pixel = clamp(ivec2(clamp(uv, vec2(0.0), vec2(0.999999)) * vec2(size)), ivec2(0), size - 1);
    return texelFetch(diffuseTex, pixel, 0);
}

uniform sampler2D baseColorTex;  // Agent color kept while a diffuse map is active
layout(location = 3) out vec4 outBaseColor;

// Color render/pointsEmit gives an agent spawned at pos.
vec4 spawnColor(vec2 pos) {
    ivec2 dims = textureSize(inputTex, 0);
    vec4 sampled = texelFetch(inputTex, ivec2(pos * vec2(dims)), 0);
    return sampled.a > 0.0 ? sampled : vec4(1.0);
}

// The agent's color without a diffuse map. baseColorTex keeps it (alpha > 0)
// while a diffuse map is active and is cleared otherwise, so this is rgba
// unless the agent still carries a diffuse color and has not respawned.
vec4 baseColor(ivec2 coord, vec4 rgba, vec2 pos) {
    vec4 kept = texelFetch(baseColorTex, coord, 0);
    if (kept.a == 0.0) return rgba;
    vec4 spawnDelta = abs(round(rgba * 255.0) - round(clamp(spawnColor(pos), 0.0, 1.0) * 255.0));
    return all(lessThanEqual(spawnDelta, vec4(1.0))) ? rgba : kept;
}

vec4 keptBaseColor(vec4 base) {
    return diffuseActive > 0.5 ? vec4(base.rgb, max(base.a, 1.0 / 255.0)) : vec4(0.0);
}

const float EPSILON = 0.0001;

// Growth function G(u) = exp(-((u - μ) / σ)²)
float growth(float u, float mu, float sigma) {
    float x = (u - mu) / sigma;
    return exp(-x * x);
}

// Derivative of growth: dG/du = G(u) * (-2(u-μ)/σ²)
float growthDerivative(float u, float mu, float sigma) {
    float G = growth(u, mu, sigma);
    return G * (-2.0 * (u - mu)) / (sigma * sigma);
}

void main() {
    ivec2 stateSize = textureSize(xyzTex, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);

    // Read current particle state
    vec4 xyz = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 rgba = texelFetch(rgbaTex, coord, 0);
    vec4 base = baseColor(coord, rgba, xyz.xy);

    float alive = xyz.w;

    // Pass through dead particles
    if (alive < 0.5) {
        outXYZ = xyz;
        outVel = vel;
        outRGBA = rgba;
        outBaseColor = keptBaseColor(base);
        return;
    }

    // Sample U field at particle position
    vec2 uv = xyz.xy;
    float U = texture(fieldTex, uv).r;

    // Compute gradient of U via finite differences
    // Use the field texture's actual size for correct texel stepping
    vec2 fieldSize = vec2(textureSize(fieldTex, 0));
    vec2 texelSize = 1.0 / fieldSize;
    float Ux_plus = texture(fieldTex, fract(uv + vec2(texelSize.x, 0.0))).r;
    float Ux_minus = texture(fieldTex, fract(uv - vec2(texelSize.x, 0.0))).r;
    float Uy_plus = texture(fieldTex, fract(uv + vec2(0.0, texelSize.y))).r;
    float Uy_minus = texture(fieldTex, fract(uv - vec2(0.0, texelSize.y))).r;

    vec2 gradU = vec2(
        (Ux_plus - Ux_minus) / (2.0 * texelSize.x),
        (Uy_plus - Uy_minus) / (2.0 * texelSize.y)
    );

    // Scale gradient to world space
    float worldScale = min(resolution.x, resolution.y) * 0.05;
    gradU /= worldScale;

    // Compute growth gradient: ∇G = dG/dU * ∇U
    float dGdU = growthDerivative(U, muG, sigmaG);
    vec2 gradG = dGdU * gradU;

    // Repulsion gradient (from U field - areas of high density repel)
    // We approximate ∇R ≈ repulsion * ∇U for simplicity
    vec2 gradR = repulsion * gradU;

    // Total force: dp/dt = ∇G - ∇R
    vec2 force = gradG - gradR;

    // Limit force magnitude for stability
    float forceMag = length(force);
    if (forceMag > 10.0) {
        force = force / forceMag * 10.0;
    }

    // Update position (Euler integration)
    vec2 newPos = uv + force * dt * 0.01;

    // Wrap to [0,1] bounds (toroidal topology)
    newPos = fract(newPos + 1.0);

    // Store velocity for visualization
    vec2 velocity = force * dt * 0.01;

    // Update age
    float age = vel.z + 0.016;

    // Output
    outXYZ = vec4(newPos, xyz.z, 1.0);  // Keep z, stay alive
    outVel = vec4(velocity, age, vel.w);  // Store velocity, age, seed
    outRGBA = diffuseActive > 0.5 ? selectedDiffuse(outXYZ.xy) : base;
    outBaseColor = keptBaseColor(base);
}
