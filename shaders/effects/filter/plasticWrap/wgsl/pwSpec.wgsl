/*
 * Plastic Wrap - specular pass.
 *
 * Deliberately textually mirrors pwSpec.glsl, with no manual Y compensation:
 * the gradient taps and the user-supplied key-light vector are interpreted
 * identically by both backends (not derived from the fragment's own position
 * relative to a center parameter), following emboss's fixed
 * kernel-tap precedent instead. The user-facing light heading is rotated
 * 180 degrees in XY below to match the height-field gradient convention while
 * leaving Z unchanged; see pwSpec.glsl.
 */

struct Uniforms {
    highlight: f32,
    smoothness: f32,
    lightDirection: vec3<f32>,
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
    let src = textureSample(inputTex, inputSampler, uv);

    let hC = lum(textureSample(blurTex, inputSampler, uv).rgb);
    let hL = lum(textureSample(blurTex, inputSampler, uv - vec2<f32>(texel.x, 0.0)).rgb);
    let hR = lum(textureSample(blurTex, inputSampler, uv + vec2<f32>(texel.x, 0.0)).rgb);
    let hB = lum(textureSample(blurTex, inputSampler, uv - vec2<f32>(0.0, texel.y)).rgb);
    let hT = lum(textureSample(blurTex, inputSampler, uv + vec2<f32>(0.0, texel.y)).rgb);

    let grad = vec2<f32>(hR - hL, hT - hB);

    let strength = 10.0;
    let n = normalize(vec3<f32>(-grad * strength, 1.0));
    let lightLengthSq = dot(uniforms.lightDirection, uniforms.lightDirection);
    let operatorLight = select(vec3<f32>(-0.4, 0.6, 0.7),
        uniforms.lightDirection, lightLengthSq > 0.000001);
    let controlledLight = vec3<f32>(-operatorLight.xy, operatorLight.z);
    let L = normalize(controlledLight);
    let V = vec3<f32>(0.0, 0.0, 1.0);
    let halfVector = L + V;
    let halfLengthSq = dot(halfVector, halfVector);
    let defaultL = normalize(vec3<f32>(0.4, -0.6, 0.7));
    let defaultHalf = normalize(defaultL + V);
    var H = defaultHalf;
    if (halfLengthSq > 0.000001) {
        H = normalize(halfVector);
    }

    let gloss = mix(24.0, 6.0, uniforms.smoothness / 100.0);
    let flatSpec = pow(H.z, gloss);
    let rawSpec = pow(clamp(dot(n, H), 0.0, 1.0), gloss);
    var spec = clamp((rawSpec - flatSpec) / max(1.0 - flatSpec, 0.0001), 0.0, 1.0);

    let curv = 4.0 * hC - hL - hR - hB - hT;
    let ridge = clamp(curv * strength * 2.0, 0.0, 1.0);
    spec = clamp(spec * 1.35 + ridge * 0.75, 0.0, 1.0);

    let specColor = clamp(vec3<f32>(spec) * (uniforms.highlight / 100.0), vec3<f32>(0.0), vec3<f32>(1.0));
    let outc = vec3<f32>(1.0) - (vec3<f32>(1.0) - src.rgb) * (vec3<f32>(1.0) - specColor);

    return vec4<f32>(outc, src.a);
}
