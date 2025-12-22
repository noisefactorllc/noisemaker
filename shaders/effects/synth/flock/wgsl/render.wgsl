// WGSL Render Shader

struct Uniforms {
    resolution: vec2f,
    inputIntensity: f32,
    colorMode: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var trailTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let uv = position.xy / uniforms.resolution;
    let flippedUV = vec2f(uv.x, 1.0 - uv.y);
    
    // Get trail color
    let trailColor = textureSample(trailTex, texSampler, uv);
    
    // Get input color if available
    let inputIntensityValue = uniforms.inputIntensity / 100.0;
    var baseColor = vec4f(0.0);
    if (uniforms.colorMode != 0) {
        let baseSample = textureSample(tex, texSampler, flippedUV);
        baseColor = vec4f(baseSample.rgb * inputIntensityValue, baseSample.a);
    }
    
    // Combine trail and input
    let combinedRgb = clamp(baseColor.rgb + trailColor.rgb, vec3f(0.0), vec3f(1.0));
    let finalAlpha = clamp(max(baseColor.a, trailColor.a), 0.0, 1.0);
    
    return vec4f(combinedRgb, finalAlpha);
}
