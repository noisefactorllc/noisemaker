/*
 * Convolution Feedback - Sharpen Pass
 * Applies unsharp mask with configurable radius
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
    
    let radius = uniforms.sharpenRadius;
    let amount = uniforms.sharpenAmount;
    
    if (radius <= 0 || amount <= 0.0) {
        return center;
    }
    
    // Compute Gaussian-weighted blur for unsharp mask
    let sigma = f32(radius) / 2.0;
    let sigma2 = sigma * sigma;
    
    var blurSum = vec3<f32>(0.0);
    var weightSum = 0.0;
    
    for (var ky = -radius; ky <= radius; ky = ky + 1) {
        for (var kx = -radius; kx <= radius; kx = kx + 1) {
            var samplePos = coord + vec2<i32>(kx, ky);
            samplePos = clamp(samplePos, vec2<i32>(0), texSize - vec2<i32>(1));
            
            let dist2 = f32(kx * kx + ky * ky);
            let weight = exp(-dist2 / (2.0 * sigma2));
            
            let texSample = textureLoad(inputTex, samplePos, 0);
            blurSum = blurSum + texSample.rgb * weight;
            weightSum = weightSum + weight;
        }
    }
    
    let blurred = blurSum / weightSum;
    
    // Unsharp mask: sharpened = original + amount * (original - blurred)
    var sharpened = center.rgb + amount * (center.rgb - blurred);
    sharpened = clamp(sharpened, vec3<f32>(0.0), vec3<f32>(1.0));
    
    return vec4<f32>(sharpened, center.a);
}
