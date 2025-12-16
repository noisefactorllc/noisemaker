// Clamped copy - prevents energy accumulation beyond 1.0

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var tex: texture_2d<f32>;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(in.position.xy);
    let val = textureLoad(tex, coord, 0);
    // Clamp to prevent runaway accumulation
    return min(val, vec4<f32>(6.0));
}
