// Outline blend pass - darken base where edges are detected

struct Params {
    invert : f32,
    _pad0 : f32,
    _pad1 : f32,
    _pad2 : f32,
}

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var inputSampler : sampler;
@group(0) @binding(2) var edgesTexture : texture_2d<f32>;
@group(0) @binding(3) var edgesSampler : sampler;
@group(0) @binding(4) var<uniform> params : Params;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) texCoord : vec2<f32>,
}

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(inputTex, inputSampler, input.texCoord);
    let edges = textureSample(edgesTexture, edgesSampler, input.texCoord);

    // Edge strength from luminance
    let strength = clamp(edges.r, 0.0, 1.0);
    
    // Outline color: black by default, white if inverted
    let outlineColor = select(vec3<f32>(0.0), vec3<f32>(1.0), params.invert > 0.5);
    
    // Apply outline where edges are present
    let out_rgb = mix(base.rgb, outlineColor, strength);
    
    return vec4<f32>(out_rgb, base.a);
}
