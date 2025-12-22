// WGSL Diffuse/Decay Pass

struct Uniforms {
    resolution: vec2f,
    trailIntensity: f32,
    resetState: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var texSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    if (uniforms.resetState != 0) {
        return vec4f(0.0);
    }
    
    let uv = position.xy / uniforms.resolution;
    let trail = textureSample(sourceTex, texSampler, uv);
    
    let decay = uniforms.trailIntensity * 0.01;
    
    return vec4f(trail.rgb * decay, trail.a);
}
