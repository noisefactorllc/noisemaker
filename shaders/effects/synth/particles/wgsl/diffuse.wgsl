struct Uniforms {
    resolution: vec2f,
    intensity: f32,
    resetState: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    if (u.resetState > 0.5) {
        return vec4f(0.0);
    }
    
    let uv = fragCoord.xy / u.resolution;
    let trailColor = textureSample(sourceTex, sourceSampler, uv);
    
    let decay = clamp(u.intensity / 100.0, 0.0, 1.0);
    return trailColor * decay;
}
