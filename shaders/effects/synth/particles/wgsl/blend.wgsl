struct Uniforms {
    resolution: vec2f,
    inputIntensity: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var trailTex: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv = fragCoord.xy / u.resolution;
    
    let inputColor = textureSample(inputTex, texSampler, uv);
    let trailColor = textureSample(trailTex, texSampler, uv);
    
    let inputFactor = u.inputIntensity / 100.0;
    
    let result = mix(trailColor.rgb, inputColor.rgb, inputFactor);
    
    return vec4f(result, 1.0);
}
