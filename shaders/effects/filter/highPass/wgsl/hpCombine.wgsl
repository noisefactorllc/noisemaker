/*
 * High pass - combine pass
 */

struct Uniforms {
    mono: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let blur = textureSample(blurTex, inputSampler, uv);
    let diff = src.rgb - blur.rgb;
    let hp = select(diff + 0.5, vec3<f32>(lum(diff) + 0.5), uniforms.mono != 0);
    return vec4<f32>(clamp(hp, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
