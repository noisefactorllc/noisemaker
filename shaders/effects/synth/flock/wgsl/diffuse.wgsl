// WGSL Diffuse/Decay Shader

struct Uniforms {
    resolution: vec2f,
    intensity: f32,
    resetState: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    // If resetState is true, clear the trail
    if (uniforms.resetState != 0) {
        return vec4f(0.0);
    }
    
    let uv = position.xy / uniforms.resolution;
    
    // Sample the trail texture directly
    let trailColor = textureSample(sourceTex, texSampler, uv);
    
    // Apply intensity decay (persistence)
    let decay = clamp(uniforms.intensity / 100.0, 0.0, 1.0);
    return trailColor * decay;
}
