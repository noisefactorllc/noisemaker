struct Uniforms {
    resolution: vec2f,
    intensity: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let coord = vec2i(fragCoord.xy);
    let current = textureLoad(sourceTex, coord, 0);
    
    // Decay factor based on intensity
    let decay = u.intensity * 0.01;
    
    return current * decay;
}
