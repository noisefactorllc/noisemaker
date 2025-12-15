/*
 * Flow3D blend pass (WGSL) - Combine input 3D volume with trail 3D volume
 * Direct port of nu/flow blend to 3D atlas format
 * 
 * Both mixerTex (inputTex3d) and trailTex are 2D atlas representations
 * of 3D volumes (width=volumeSize, height=volumeSize²)
 */

@group(0) @binding(0) var mixerTex: texture_2d<f32>;
@group(0) @binding(1) var trailTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> inputIntensity: f32;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(position.xy);
    
    // Both textures are 3D atlas format, sample directly with integer coords
    let inputIntensityValue = inputIntensity / 100.0;
    let baseSample = textureLoad(mixerTex, coord, 0);
    let baseColor = vec4<f32>(baseSample.rgb * inputIntensityValue, baseSample.a);
    
    let trailColor = textureLoad(trailTex, coord, 0);
    
    // Combine: add trail on top of input (same as 2D flow)
    let combinedRgb = clamp(baseColor.rgb + trailColor.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let finalAlpha = clamp(max(baseColor.a, trailColor.a), 0.0, 1.0);
    
    return vec4<f32>(combinedRgb, finalAlpha);
}
