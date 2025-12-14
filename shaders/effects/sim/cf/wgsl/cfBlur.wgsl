/*
 * Convolution Feedback - Blur Pass
 * Applies Gaussian blur with configurable radius and amount
 */

struct Uniforms {
    sharpenRadius: i32,
    blurRadius: i32,
    sharpenAmount: f32,
    blurAmount: f32,
    intensity: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let texSize = vec2<i32>(textureDimensions(inputTex));
    let coord = vec2<i32>(in.position.xy);
    
    let center = textureLoad(inputTex, coord, 0);
    let radius = uniforms.blurRadius;
    let amount = uniforms.blurAmount;
    
    if (radius <= 0 || amount <= 0.0) {
        return center;
    }
    
    // Compute sigma for Gaussian (radius ~= 2*sigma for good coverage)
    let sigma = f32(radius) / 2.0;
    let sigma2 = sigma * sigma;
    
    var sum = vec3<f32>(0.0);
    var weightSum = 0.0;
    
    for (var ky = -radius; ky <= radius; ky = ky + 1) {
        for (var kx = -radius; kx <= radius; kx = kx + 1) {
            var samplePos = coord + vec2<i32>(kx, ky);
            samplePos = clamp(samplePos, vec2<i32>(0), texSize - vec2<i32>(1));
            
            let dist2 = f32(kx * kx + ky * ky);
            let weight = exp(-dist2 / (2.0 * sigma2));
            
            let texSample = textureLoad(inputTex, samplePos, 0);
            sum = sum + texSample.rgb * weight;
            weightSum = weightSum + weight;
        }
    }
    
    let blurred = sum / weightSum;
    
    // Mix between original and blurred based on blurAmount
    let result = mix(center.rgb, blurred, amount);
    
    return vec4<f32>(result, center.a);
}
