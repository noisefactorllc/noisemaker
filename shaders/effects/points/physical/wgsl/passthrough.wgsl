@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var texSampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
    // Copy the input as the GLSL does (gl_FragCoord / resolution). The default
    // vertex uv has a bottom-left origin, so sampling at it flipped the copy.
    return textureSample(inputTex, texSampler, in.position.xy / vec2f(textureDimensions(inputTex, 0)));
}
