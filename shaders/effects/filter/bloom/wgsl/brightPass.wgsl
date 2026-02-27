/*
 * Bloom bright-pass extraction
 * Isolates highlight energy using threshold + soft knee
 * All math in linear color space
 */

struct Uniforms {
    threshold: f32,
    softKnee: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let color = textureSample(inputTex, inputSampler, uv);
    
    // Compute luminance (Rec. 709)
    let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    
    // Soft knee thresholding
    let knee = uniforms.softKnee;
    let threshLow = uniforms.threshold - knee;
    let threshHigh = uniforms.threshold + knee;
    
    var bloomFactor: f32;
    if (luma <= threshLow) {
        bloomFactor = 0.0;
    } else if (luma >= threshHigh) {
        bloomFactor = 1.0;
    } else {
        // Smoothstep for the soft knee region
        let t = (luma - threshLow) / (threshHigh - threshLow);
        bloomFactor = t * t * (3.0 - 2.0 * t);
    }
    
    // Multiply original HDR color by bloom factor
    let brightColor = color.rgb * bloomFactor;
    
    return vec4<f32>(brightColor, color.a);
}
