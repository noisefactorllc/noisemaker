// Physarum - Initialize from previous frame
// Copies the previous trail texture with decay for temporal accumulation

struct Uniforms {
    resolution: vec2<f32>,
    intensity: f32,
    _pad: f32,
}

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var prevTrailTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / uniforms.resolution;
    let prev = textureSample(prevTrailTex, u_sampler, uv);
    
    // Fade previous frame's trail based on intensity (persistence)
    let fade = uniforms.intensity / 100.0;
    return prev * fade;
}
