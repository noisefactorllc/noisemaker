/*
 * Motion Blur - Simple frame blending shader (WGSL).
 * Mixes current input with previous frame for a motion blur effect.
 * Amount 0-100 maps to 0-40% mix factor.
 */

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    seed: f32,
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
    
    // Map amount 0-100 to 0-0.4 (equivalent to feedback at 40%)
    let mixFactor = uniforms.amount * 0.004;
    
    return mix(current, previous, mixFactor);
}
