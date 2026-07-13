/*
 * Strokes - stkPost pass. See glsl/stkPost.glsl for the full algorithm
 * description; this is a 1:1 port. The tent3x3 kernel uses literal,
 * backend-agnostic integer offsets (same category as filter/oilPaint's
 * tent3x3 / filter/emboss's kernel), so this textually matches the GLSL
 * form with no flip.
 */

struct Uniforms {
    sharpness: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var smearTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn tent3x3(uv: vec2<f32>) -> vec3<f32> {
    let texSize = vec2<f32>(textureDimensions(smearTex));
    let px = 1.0 / texSize;
    var sum = vec3<f32>(0.0);
    var wsum = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            let w = select(1.0, 2.0, dx == 0) * select(1.0, 2.0, dy == 0);
            sum += textureSample(smearTex, inputSampler, uv + vec2<f32>(f32(dx), f32(dy)) * px).rgb * w;
            wsum += w;
        }
    }
    return sum / wsum;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let c = textureSample(smearTex, inputSampler, uv).rgb;

    let tent = tent3x3(uv);
    let sharpened = c + (c - tent) * (uniforms.sharpness / 33.0);

    return vec4<f32>(clamp(sharpened, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
