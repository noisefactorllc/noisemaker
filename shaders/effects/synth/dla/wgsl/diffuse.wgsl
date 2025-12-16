// DLA - Diffuse Pass (visual trail persistence)

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var sourceTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> intensity: f32;
@group(0) @binding(2) var<uniform> resetState: i32;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    // If resetState is true, clear the trail
    if (resetState != 0) {
        return vec4<f32>(0.0);
    }
    
    let coord = vec2<i32>(in.position.xy);
    
    // Sample the trail texture directly (no blur)
    let trailColor = textureLoad(sourceTex, coord, 0);
    
    // Apply intensity decay (persistence) - faithfully matches flow implementation
    // intensity=100 means no decay, intensity=0 means instant fade
    let decay = clamp(intensity / 100.0, 0.0, 1.0);
    return trailColor * decay;
}
