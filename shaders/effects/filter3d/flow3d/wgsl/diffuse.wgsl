/*
 * Flow3D diffuse pass (WGSL) - decay the 3D trail volume
 */

@group(0) @binding(0) var sourceTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> intensity: f32;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(position.xy);
    
    // Sample the trail texture directly (no blur)
    let trailColor = textureLoad(sourceTex, coord, 0);
    
    // Apply intensity decay (persistence)
    // intensity=100 means no decay, intensity=0 means instant fade
    let decay = clamp(intensity / 100.0, 0.0, 1.0);
    return trailColor * decay;
}
