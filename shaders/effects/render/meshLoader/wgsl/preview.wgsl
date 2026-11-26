// Preview mesh data as visualization

struct Uniforms {
    resolution: vec2<f32>,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
    renderScale: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var positionsTex: texture_2d<f32>;
@group(0) @binding(2) var positionsSampler: sampler;
@group(0) @binding(3) var normalsTex: texture_2d<f32>;
@group(0) @binding(4) var normalsSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let fullRes = select(u.resolution, u.fullResolution, u.fullResolution.x > 0.0);
    let globalUV = (position.xy + u.tileOffset) / fullRes;
    let positionsUV = position.xy / vec2<f32>(textureDimensions(positionsTex));
    let normalsUV = position.xy / vec2<f32>(textureDimensions(normalsTex));
    
    // Match WebGL2's preview sampling: address the packed mesh textures by
    // their own dimensions rather than scaling them across the output frame.
    let pos = textureSample(positionsTex, positionsSampler, positionsUV);
    let normal = textureSample(normalsTex, normalsSampler, normalsUV);
    
    var color: vec3<f32>;
    if (globalUV.x < 0.5) {
        // Position visualization
        color = pos.xyz * 0.5 + 0.5;
    } else {
        // Normal visualization
        color = normal.xyz * 0.5 + 0.5;
    }
    
    return vec4<f32>(color, 1.0);
}
