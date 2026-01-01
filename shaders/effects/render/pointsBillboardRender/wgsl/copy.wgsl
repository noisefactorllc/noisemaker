// Copy Pass - Blit source to destination (for ping-pong correction)

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var sourceTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / resolution;
    return textureSample(sourceTex, u_sampler, uv);
}
