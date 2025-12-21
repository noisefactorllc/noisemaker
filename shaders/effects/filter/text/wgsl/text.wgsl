/*
 * Text overlay shader (WGSL).
 * Blends pre-rendered text texture over an input image.
 * The text is rendered to a 2D canvas on the CPU side and uploaded as a texture.
 *
 * The canvas has:
 * - Text pixels: full alpha (1.0) with text color
 * - Background pixels: alpha = bgOpacity with bgColor
 *
 * We blend so that:
 * - Text areas show text color over input
 * - Background areas blend bgColor over input by bgOpacity amount
 * - Final alpha is always preserved from input
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
fn main(fsInput: VertexOutput) -> @location(0) vec4<f32> {
    // Unused uniforms reference to keep binding layout consistent
    let unused = uniforms.data[0].x;
    
    let inputColor = textureSample(inputTex, texSampler, fsInput.uv);
    let text = textureSample(textTex, texSampler, fsInput.uv);
    
    // The canvas encodes both text and background in the texture.
    // Text has alpha = 1.0, background has alpha = bgOpacity.
    // We use the canvas color directly, blending by its alpha,
    // but preserve the INPUT's alpha channel for the output.
    
    let result = mix(inputColor.rgb, text.rgb, text.a);
    
    // Preserve input alpha - bgOpacity shouldn't affect final alpha
    return vec4<f32>(result, inputColor.a);
}
