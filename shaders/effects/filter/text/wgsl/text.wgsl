/*
 * Text overlay shader (WGSL).
 * Blends pre-rendered text texture over an input image.
 * The text is rendered to a 2D canvas on the CPU side and uploaded as a texture.
 */

struct Uniforms {
    data : array<vec4<f32>, 1>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var textTex: texture_2d<f32>;

@fragment
fn main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Unused uniforms reference to keep binding layout consistent
    let unused = uniforms.data[0].x;
    
    let bg = textureSample(inputTex, texSampler, input.uv);
    let text = textureSample(textTex, texSampler, input.uv);
    
    // Alpha blend text over background
    return mix(bg, text, text.a);
}
