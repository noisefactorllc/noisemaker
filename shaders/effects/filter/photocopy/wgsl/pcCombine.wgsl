/*
 * Photocopy - combine pass (see pcCombine.glsl).
 */

struct Uniforms {
    darkness: f32,
    inkColor: vec3<f32>,
    paperColor: vec3<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn tonemap2(t: f32, ink: vec3<f32>, paper: vec3<f32>) -> vec3<f32> {
    return mix(ink, paper, clamp(t, 0.0, 1.0));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let blur = textureSample(blurTex, inputSampler, uv);

    let lumSrc = lum(src.rgb);
    let lumBlur = lum(blur.rgb);
    let band = lumSrc - lumBlur;

    let edgeGain = mix(4.0, 18.0, uniforms.darkness / 100.0);
    let edgeInk = clamp(abs(band) * edgeGain, 0.0, 1.0);

    let toneHi = mix(0.35, 0.68, uniforms.darkness / 100.0);
    let toneLo = toneHi - 0.26;
    let toneInk = 1.0 - smoothstep(toneLo, toneHi, lumSrc);

    let ink = clamp(max(edgeInk, toneInk), 0.0, 1.0);

    let outColor = tonemap2(1.0 - ink, uniforms.inkColor, uniforms.paperColor);
    return vec4<f32>(outColor, src.a);
}
