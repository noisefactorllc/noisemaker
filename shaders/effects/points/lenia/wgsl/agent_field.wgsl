// Agent update pass - samples pre-convolved U field
// Much faster than O(n²) as field is already computed

struct Uniforms {
    resolution: vec2f,
    muG: f32,
    sigmaG: f32,
    repulsion: f32,
    dt: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(2) var velTex: texture_2d<f32>;
@group(0) @binding(3) var rgbaTex: texture_2d<f32>;
@group(0) @binding(4) var fieldTex: texture_2d<f32>;
@group(0) @binding(5) var fieldSampler: sampler;

const EPSILON: f32 = 0.0001;

// Growth function G(u) = exp(-((u - μ) / σ)²)
fn growth(u: f32, mu: f32, sigma: f32) -> f32 {
    let x = (u - mu) / sigma;
    return exp(-x * x);
}

// Derivative of growth: dG/du = G(u) * (-2(u-μ)/σ²)
fn growthDerivative(u: f32, mu: f32, sigma: f32) -> f32 {
    let G = growth(u, mu, sigma);
    return G * (-2.0 * (u - mu)) / (sigma * sigma);
}

struct FragmentOutput {
    @location(0) outXYZ: vec4f,
    @location(1) outVel: vec4f,
    @location(2) outRGBA: vec4f,
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> FragmentOutput {
    var output: FragmentOutput;

    let coord = vec2i(fragCoord.xy);

    // Read current particle state
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);

    // Sample U field at particle position - MUST be in uniform control flow
    // Do all texture samples before any early returns
    let uv = xyz.xy;
    // Use the field texture's actual size for correct texel stepping
    let fieldDims = textureDimensions(fieldTex, 0);
    let texelSize = 1.0 / vec2f(f32(fieldDims.x), f32(fieldDims.y));
    let U = textureSample(fieldTex, fieldSampler, uv).r;
    let Ux_plus = textureSample(fieldTex, fieldSampler, fract(uv + vec2f(texelSize.x, 0.0))).r;
    let Ux_minus = textureSample(fieldTex, fieldSampler, fract(uv - vec2f(texelSize.x, 0.0))).r;
    let Uy_plus = textureSample(fieldTex, fieldSampler, fract(uv + vec2f(0.0, texelSize.y))).r;
    let Uy_minus = textureSample(fieldTex, fieldSampler, fract(uv - vec2f(0.0, texelSize.y))).r;

    let alive = xyz.w;

    // Pass through dead particles
    if (alive < 0.5) {
        output.outXYZ = xyz;
        output.outVel = vel;
        output.outRGBA = rgba;
        return output;
    }

    // Compute gradient of U via finite differences
    var gradU = vec2f(
        (Ux_plus - Ux_minus) / (2.0 * texelSize.x),
        (Uy_plus - Uy_minus) / (2.0 * texelSize.y)
    );

    // Scale gradient to world space
    let worldScale = min(uniforms.resolution.x, uniforms.resolution.y) * 0.05;
    gradU /= worldScale;

    // Compute growth gradient: ∇G = dG/dU * ∇U
    let dGdU = growthDerivative(U, uniforms.muG, uniforms.sigmaG);
    let gradG = dGdU * gradU;

    // Repulsion gradient (approximated from U field)
    let gradR = uniforms.repulsion * gradU;

    // Total force: dp/dt = ∇G - ∇R
    var force = gradG - gradR;

    // Limit force magnitude for stability
    let forceMag = length(force);
    if (forceMag > 10.0) {
        force = force / forceMag * 10.0;
    }

    // Update position (Euler integration)
    var newPos = uv + force * uniforms.dt * 0.01;

    // Wrap to [0,1] bounds (toroidal topology)
    newPos = fract(newPos + 1.0);

    // Store velocity for visualization
    let velocity = force * uniforms.dt * 0.01;

    // Update age
    let age = vel.z + 0.016;

    // Output
    output.outXYZ = vec4f(newPos, xyz.z, 1.0);
    output.outVel = vec4f(velocity, age, vel.w);
    output.outRGBA = rgba;

    return output;
}
