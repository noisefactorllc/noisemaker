// Copy Pass - Blit grid to write buffer for proper blending

@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var gridTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / resolution;
    return textureSample(gridTex, uSampler, uv);
}
