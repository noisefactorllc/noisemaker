// Kernel convolution pass - applies K(r) gaussian shell kernel to density field
// Standard binding order: sampler(0), texture(1), uniforms(2)

struct Uniforms {
    resolution: vec2f,
    muK: f32,
    sigmaK: f32,
    searchRadius: f32,
}

@group(0) @binding(0) var densitySampler: sampler;
@group(0) @binding(1) var densityTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const EPSILON: f32 = 0.0001;
const PI: f32 = 3.14159265359;

// Gaussian shell kernel K(r) = exp(-((r - μ) / σ)²)
fn kernel(r: f32, mu: f32, sigma: f32) -> f32 {
    let x = (r - mu) / sigma;
    return exp(-x * x);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    // Use the actual density texture size, not output resolution
    let densityDims = textureDimensions(densityTex, 0);
    let densitySize = vec2f(f32(densityDims.x), f32(densityDims.y));
    let uv = fragCoord.xy / densitySize;
    let texelSize = 1.0 / densitySize;

    // Compute kernel weight for normalization
    var wK: f32 = 0.0;
    let numSamples: i32 = 64;
    let dr = uniforms.searchRadius / f32(numSamples);
    for (var i: i32 = 0; i < numSamples; i++) {
        let r = (f32(i) + 0.5) * dr;
        wK += kernel(r, uniforms.muK, uniforms.sigmaK) * r * dr;
    }
    wK = 1.0 / max(wK * 2.0 * PI, EPSILON);

    // Accumulate kernel-weighted density from neighbors
    var U: f32 = 0.0;
    let iRadius = i32(ceil(uniforms.searchRadius));

    for (var dy: i32 = -iRadius; dy <= iRadius; dy++) {
        for (var dx: i32 = -iRadius; dx <= iRadius; dx++) {
            let r = length(vec2f(f32(dx), f32(dy)));

            // Skip if outside search radius
            if (r > uniforms.searchRadius) {
                continue;
            }

            // Sample density at neighbor (wrap around edges)
            let sampleUV = fract(uv + vec2f(f32(dx), f32(dy)) * texelSize);
            let density = textureSampleLevel(densityTex, densitySampler, sampleUV, 0.0).r;

            // Apply kernel weight
            let kVal = kernel(r, uniforms.muK, uniforms.sigmaK) * wK;
            U += density * kVal;
        }
    }

    return vec4f(U, 0.0, 0.0, 1.0);
}
