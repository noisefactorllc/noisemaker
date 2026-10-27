/*
 * Vertical Gaussian blur pass
 */

struct Uniforms {
    radiusX: f32,
    radiusY: f32,
    renderScale: f32,
    _pad2: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;
    
    let radius = i32(uniforms.radiusY * uniforms.renderScale);
    if (radius <= 0) {
        return textureSample(inputTex, inputSampler, uv);
    }
    
    // Compute sigma for Gaussian (radius ~= 3*sigma)
    let sigma = f32(radius) / 3.0;
    let sigma2 = sigma * sigma;
    
    var sum = vec4<f32>(0.0);
    var weightSum = 0.0;
    
    for (var i = -radius; i <= radius; i = i + 1) {
        let x = f32(i);
        let weight = exp(-(x * x) / (2.0 * sigma2));
        let offset = vec2<f32>(0.0, f32(i) * texelSize.y);
        sum = sum + textureSample(inputTex, inputSampler, uv + offset) * weight;
        weightSum = weightSum + weight;
    }
    
    return sum / weightSum;
}
