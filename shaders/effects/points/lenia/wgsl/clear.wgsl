// Clear shader - clears texture to zero

struct Uniforms {
    resolution: vec2<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main() -> @location(0) vec4<f32> {
    return vec4<f32>(0.0);
}
