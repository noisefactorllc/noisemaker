// WGSL Deposit Fragment Shader

struct FragmentInput {
    @location(0) vUV: vec2f,
    @location(1) vColor: vec4f,
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
    // Deposit boid color with fixed intensity
    let depositAmount = 0.1;
    return vec4f(input.vColor.rgb * depositAmount, 1.0);
}
