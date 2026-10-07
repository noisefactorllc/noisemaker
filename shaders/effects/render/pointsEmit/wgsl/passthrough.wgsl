@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputTexSampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
    // Copy the input as the GLSL does, at gl_FragCoord / resolution: the
    // output-normalized coordinate with a top-left origin. The default vertex
    // uv has a bottom-left origin, so it is flipped vertically.
    return textureSample(inputTex, inputTexSampler, vec2f(in.uv.x, 1.0 - in.uv.y));
}
