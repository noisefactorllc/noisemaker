// Preview mesh data as visualization

struct Uniforms {
    resolution: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var positionsTex: texture_2d<f32>;
@group(0) @binding(2) var positionsSampler: sampler;
@group(0) @binding(3) var normalsTex: texture_2d<f32>;
@group(0) @binding(4) var normalsSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / u.resolution;
    
    // Sample mesh textures using UV coordinates
    let pos = textureSample(positionsTex, positionsSampler, uv);
    let normal = textureSample(normalsTex, normalsSampler, uv);
    
    var color: vec3<f32>;
    if (uv.x < 0.5) {
        // Position visualization
        color = pos.xyz * 0.5 + 0.5;
    } else {
        // Normal visualization
        color = normal.xyz * 0.5 + 0.5;
    }
    
    return vec4<f32>(color, 1.0);
}
