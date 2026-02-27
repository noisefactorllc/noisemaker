/*
 * Bloom N-tap gather pass
 * Samples bright texture with configurable radially symmetric kernel
 * Kernel uses concentric rings with Gaussian-ish falloff
 */

struct Uniforms {
    radius: f32,
    taps: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Golden angle for Poisson-like disk distribution
const GOLDEN_ANGLE: f32 = 2.39996323;
const MAX_TAPS: i32 = 64;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;
    
    // Bloom radius in UV space
    let radiusUV = uniforms.radius * texelSize;

    // Clamp taps to valid range
    let tapCount = clamp(i32(uniforms.taps), 1, MAX_TAPS);
    
    var bloomAccum = vec3<f32>(0.0);
    var weightSum: f32 = 0.0;
    
    // Generate N-tap kernel using golden angle spiral (Poisson-ish distribution)
    // with Gaussian-like radial falloff for weights
    for (var i: i32 = 0; i < MAX_TAPS; i++) {
        if (i >= tapCount) { break; }

        // Compute tap offset using golden angle spiral
        // r goes from 0 to 1 as sqrt(i/N) for uniform area distribution
        let t = f32(i) / f32(tapCount);
        let r = sqrt(t);
        let theta = f32(i) * GOLDEN_ANGLE;
        
        let offset = vec2<f32>(cos(theta), sin(theta)) * r;
        
        // Gaussian-ish weight based on distance from center
        let sigma: f32 = 0.4;
        let weight = exp(-0.5 * (r * r) / (sigma * sigma));
        
        // Sample with clamped UV (edge handling)
        let sampleUV = clamp(uv + offset * radiusUV, vec2<f32>(0.0), vec2<f32>(1.0));
        let sampleColor = textureSample(inputTex, inputSampler, sampleUV).rgb;
        
        bloomAccum += sampleColor * weight;
        weightSum += weight;
    }
    
    // Normalize for energy conservation
    if (weightSum > 0.0) {
        bloomAccum /= weightSum;
    }
    
    return vec4<f32>(bloomAccum, 1.0);
}
