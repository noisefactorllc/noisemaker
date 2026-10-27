// Agent update pass - samples pre-convolved U field
// Much faster than O(n²) as field is already computed
// Binding order: loaded textures (0-2), sampled texture pair (3-4), uniforms (5)

struct Uniforms {
    diffuseActive: f32,
    resolution: vec2f,
    muG: f32,
    sigmaG: f32,
    repulsion: f32,
    dt: f32,
}

@group(0) @binding(0) var xyzTex: texture_2d<f32>;
@group(0) @binding(1) var velTex: texture_2d<f32>;
@group(0) @binding(2) var rgbaTex: texture_2d<f32>;
@group(0) @binding(6) var diffuseTex: texture_2d<f32>;
@group(0) @binding(7) var baseColorTex: texture_2d<f32>;
@group(0) @binding(8) var inputTex: texture_2d<f32>;

fn selectedDiffuse(uv: vec2f) -> vec4f {
    let size = textureDimensions(diffuseTex, 0);
    let pixel = clamp(vec2i(clamp(uv, vec2f(0.0), vec2f(0.999999)) * vec2f(size)), vec2i(0), vec2i(size) - vec2i(1));
    return textureLoad(diffuseTex, pixel, 0);
}

// Color render/pointsEmit gives an agent spawned at pos.
fn spawnColor(pos: vec2f) -> vec4f {
    let dims = textureDimensions(inputTex);
    let sampled = textureLoad(inputTex, vec2<i32>(pos * vec2<f32>(dims)), 0);
    return select(vec4f(1.0), sampled, sampled.a > 0.0);
}

// The agent's color without a diffuse map. baseColorTex keeps it (alpha > 0)
// while a diffuse map is active and is cleared otherwise, so this is rgba
// unless the agent still carries a diffuse color and has not respawned.
fn baseColor(coord: vec2i, rgba: vec4f, pos: vec2f) -> vec4f {
    let kept = textureLoad(baseColorTex, coord, 0);
    if (kept.a == 0.0) { return rgba; }
    let spawnDelta = abs(round(rgba * 255.0) - round(clamp(spawnColor(pos), vec4f(0.0), vec4f(1.0)) * 255.0));
    return select(kept, rgba, all(spawnDelta <= vec4f(1.0)));
}

fn keptBaseColor(base: vec4f) -> vec4f {
    return select(vec4f(0.0), vec4f(base.rgb, max(base.a, 1.0 / 255.0)), uniforms.diffuseActive > 0.5);
}

@group(0) @binding(3) var fieldSampler: sampler;
@group(0) @binding(4) var fieldTex: texture_2d<f32>;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

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
    @location(3) baseColor: vec4f,
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> FragmentOutput {
    var output: FragmentOutput;

    let coord = vec2i(fragCoord.xy);

    // Read current particle state
    let xyz = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let rgba = textureLoad(rgbaTex, coord, 0);
    let base = baseColor(coord, rgba, xyz.xy);

    // Sample U field at particle position - MUST be in uniform control flow
    // Do all texture samples before any early returns
    let uv = xyz.xy;
    // Use the field texture's actual size for correct texel stepping
    let fieldDims = textureDimensions(fieldTex, 0);
    let texelSize = 1.0 / vec2f(f32(fieldDims.x), f32(fieldDims.y));
    let U = textureSampleLevel(fieldTex, fieldSampler, uv, 0.0).r;
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
        output.baseColor = keptBaseColor(base);
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
    output.outRGBA = select(base, selectedDiffuse(newPos), uniforms.diffuseActive > 0.5);
    output.baseColor = keptBaseColor(base);

    return output;
}
