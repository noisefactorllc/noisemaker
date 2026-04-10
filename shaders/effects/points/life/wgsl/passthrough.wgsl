// Passthrough shader - copy input to output for 2D chain continuity

struct Uniforms {
    resolution: vec2f,
    time: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let uv = position.xy / u.resolution;
    return textureSampleLevel(inputTex, inputSampler, uv, 0.0);
}
