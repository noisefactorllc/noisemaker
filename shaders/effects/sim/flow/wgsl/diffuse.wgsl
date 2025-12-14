// Flow diffuse pass - decay the trail texture (no blur)

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var sourceTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution : vec2<f32>;
@group(0) @binding(3) var<uniform> intensity : f32;
@group(0) @binding(4) var<uniform> resetState : i32;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    // If resetState is true, clear the trail
    if (resetState != 0) {
        return vec4<f32>(0.0);
    }
    
    let size = max(resolution, vec2<f32>(1.0));
    let uv = position.xy / size;
    
    // Sample the trail texture directly (no blur)
    let trailColor = textureSample(sourceTex, u_sampler, uv);
    
    // Apply intensity decay (persistence) - faithfully matches reference implementation
    // intensity=100 means no decay, intensity=0 means instant fade
    let decay = clamp(intensity / 100.0, 0.0, 1.0);
    return trailColor * decay;
}
