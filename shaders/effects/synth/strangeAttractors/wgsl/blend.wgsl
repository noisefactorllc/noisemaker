struct Uniforms {
    resolution: vec2f,
    inputIntensity: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var trailTex: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let texSize = vec2f(textureDimensions(trailTex, 0));
    let uv = fragCoord.xy / texSize;
    
    let inputColor = textureSample(tex, texSampler, uv);
    let trailColor = textureSample(trailTex, texSampler, uv);
    
    let inputMix = u.inputIntensity * 0.01;
    
    var result = mix(trailColor, inputColor, inputMix);
    result.a = 1.0;
    
    return result;
}
