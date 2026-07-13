/*
 * Unsharp mask - combine pass
 */

struct Uniforms {
    amount: f32,
    threshold: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let blur = textureSample(blurTex, inputSampler, uv);
    let diff = src.rgb - blur.rgb;
    let t = uniforms.threshold / 100.0;
    let mag = max(max(abs(diff.r), abs(diff.g)), abs(diff.b));
    let gate = smoothstep(t, t + 0.02, mag);
    let outc = src.rgb + diff * (uniforms.amount / 100.0) * gate;
    return vec4<f32>(clamp(outc, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
