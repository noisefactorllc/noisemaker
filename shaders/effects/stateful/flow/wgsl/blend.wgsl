// Flow blend pass - combines input with accumulated trails

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var trailTex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> resolution : vec2<f32>;
@group(0) @binding(4) var<uniform> inputIntensity : f32;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let size = max(resolution, vec2<f32>(1.0));
    var uv = position.xy / size;
    let flippedUV = vec2<f32>(uv.x, 1.0 - uv.y);
    
    let inputIntensityValue = inputIntensity / 100.0;
    let baseSample = textureSample(inputTex, u_sampler, flippedUV);
    let baseColor = vec4<f32>(baseSample.rgb * inputIntensityValue, baseSample.a);
    
    let trailColor = textureSample(trailTex, u_sampler, uv);
    
    let combinedRgb = clamp(baseColor.rgb + trailColor.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let finalAlpha = clamp(max(baseColor.a, trailColor.a), 0.0, 1.0);
    
    return vec4<f32>(combinedRgb, finalAlpha);
}
