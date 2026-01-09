// Copy Pass - Blit source to destination (for ping-pong correction)
// Pass provides: sourceTex (binding 0), sampler (binding 1)
// No uniforms - use texture dimensions for resolution

@group(0) @binding(0) var sourceTex: texture_2d<f32>;
@group(0) @binding(1) var u_sampler: sampler;

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = textureDimensions(sourceTex, 0);
    let uv = position.xy / vec2<f32>(f32(dims.x), f32(dims.y));
    return textureSample(sourceTex, u_sampler, uv);
}
