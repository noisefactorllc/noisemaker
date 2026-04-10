/*
 * Smoothstep threshold effect
 * Creates smooth transition between edge0 and edge1
 */

struct Uniforms {
    edge0: f32,
    edge1: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let edge0 = uniforms.edge0;
    let edge1 = uniforms.edge1;

    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    var color = textureSampleLevel(inputTex, inputSampler, uv, 0.0);

    color = vec4<f32>(smoothstep(vec3<f32>(edge0), vec3<f32>(edge1), color.rgb), color.a);

    return color;
}
