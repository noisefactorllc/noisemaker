/*
 * Motion Blur - Simple frame blending shader (WGSL).
 * Mixes current input with previous frame for a motion blur effect.
 * Amount 0-100 maps to mix factor (stronger at higher values).
 */

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    seed: i32,
    amount: f32,
    resetState: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var selfTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / uniforms.resolution;
    
    // If resetState is true, bypass feedback and return input directly
    if (uniforms.resetState != 0) {
        return textureSample(inputTex, texSampler, uv);
    }

    let current = textureSample(inputTex, texSampler, uv);
    let previous = textureSample(selfTex, texSampler, uv);
    
    // Map amount 0-100 to 0-1.6 (clamped, stronger motion blur)
    let mixFactor = clamp(uniforms.amount * 0.016, 0.0, 0.98);
    
    return mix(current, previous, mixFactor);
}
