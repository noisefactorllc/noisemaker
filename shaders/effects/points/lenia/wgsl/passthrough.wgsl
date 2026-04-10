// Passthrough shader - copy input to output for 2D chain continuity
// Standard binding order: sampler(0), texture(1) - no uniforms needed

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let dims = textureDimensions(inputTex, 0);
    let uv = position.xy / vec2f(f32(dims.x), f32(dims.y));
    return textureSampleLevel(inputTex, inputSampler, uv, 0.0);
}
