/*
 * Derivative-based edge detection
 * Computes image derivatives to highlight edges
 */

struct Uniforms {
    amount: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn desaturate(color: vec3<f32>) -> vec3<f32> {
    let avg = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return vec3<f32>(avg);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;
    
    let color = textureSample(inputTex, inputSampler, uv);
    
    // Sample neighbors for derivative calculation
    let center = desaturate(color.rgb);
    let right = desaturate(textureSample(inputTex, inputSampler, uv + vec2<f32>(texelSize.x * uniforms.amount, 0.0)).rgb);
    let bottom = desaturate(textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, texelSize.y * uniforms.amount)).rgb);
    
    // Compute derivatives
    let dx = center - right;
    let dy = center - bottom;
    
    let dist = distance(dx, dy) * 2.5;
    
    return vec4<f32>(clamp(color.rgb * dist, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);
}
