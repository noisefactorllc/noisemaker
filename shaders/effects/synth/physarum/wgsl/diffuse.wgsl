// Diffuse Pass - Decay existing trail

struct Uniforms {
    resolution: vec2<f32>,
    decay: f32,
    resetState: u32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var trailTex: texture_2d<f32>;
@group(0) @binding(2) var trailSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    // If resetState is true, clear the trail
    if (u.resetState != 0u) {
        return vec4<f32>(0.0);
    }
    
    let uv = fragCoord.xy / u.resolution;
    
    // Sample the trail texture directly (no blur)
    let trailColor = textureSample(trailTex, trailSampler, uv);
    
    // Apply decay
    // decay=0 means no decay (persistence 1.0)
    // decay=1 means instant fade (persistence 0.0)
    let persistence = clamp(1.0 - u.decay, 0.0, 1.0);
    return trailColor * persistence;
}
