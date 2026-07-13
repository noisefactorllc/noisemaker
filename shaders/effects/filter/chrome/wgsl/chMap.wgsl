/*
 * Chrome - map pass. See chMap.glsl for the full algorithm derivation.
 * This is a 1:1 port with NO manual Y compensation anywhere: blurTex reads
 * are orientation-transparent on both backends, and
 * the oscillating tone curve is a pure function of height only - nothing
 * fragment-coordinate-derived beyond the sample UV itself - so GLSL and
 * WGSL are textually identical.
 */

struct Uniforms {
    detail: f32,
    distortion: f32,
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
    let texel = 1.0 / texSize;

    let hL = lum(textureSample(blurTex, inputSampler, uv - vec2<f32>(texel.x, 0.0)).rgb);
    let hR = lum(textureSample(blurTex, inputSampler, uv + vec2<f32>(texel.x, 0.0)).rgb);
    let hB = lum(textureSample(blurTex, inputSampler, uv - vec2<f32>(0.0, texel.y)).rgb);
    let hT = lum(textureSample(blurTex, inputSampler, uv + vec2<f32>(0.0, texel.y)).rgb);
    let grad = vec2<f32>(hR - hL, hT - hB);

    let uv2 = uv + grad * (uniforms.distortion / 100.0) * 0.5;
    let h2 = lum(textureSample(blurTex, inputSampler, uv2).rgb);

    let cycles = mix(1.0, 7.0, uniforms.detail / 100.0);
    var v = 0.5 + 0.5 * sin(h2 * cycles * 6.28318530718 + h2 * 3.0);
    v += pow(v, 8.0) * 0.5;
    v = clamp(v, 0.0, 1.0);

    let outColor = clamp(vec3<f32>(v) * vec3<f32>(0.96, 0.98, 1.02), vec3<f32>(0.0), vec3<f32>(1.0));

    let src = textureSample(inputTex, inputSampler, uv);
    return vec4<f32>(outColor, src.a);
}
