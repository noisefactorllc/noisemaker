// Deposit fragment shader - each particle deposits a constant value

struct Uniforms {
    resolution: vec2f,
    depositAmount: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main() -> @location(0) vec4f {
    // Each particle deposits a constant value
    return vec4f(uniforms.depositAmount, 0.0, 0.0, 1.0);
}
