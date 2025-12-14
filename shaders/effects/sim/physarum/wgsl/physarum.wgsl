/*
 * Physarum render shader (WGSL port).
 * Final output - mono only.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var bufTex: texture_2d<f32>;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    inputIntensity: f32,
}

fn sampleInputColor(uv: vec2f) -> vec3f {
    let flippedUV = vec2f(uv.x, 1.0 - uv.y);
    return textureSample(inputTex, samp, flippedUV).rgb;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv = fragCoord.xy / u.resolution;
    let trail = textureSample(bufTex, samp, uv).r;
    let tone = trail / (1.0 + trail);
    var color = vec3f(tone);
    
    // Blend input texture at output stage
    if (u.inputIntensity > 0.0) {
        let intensity = clamp(u.inputIntensity * 0.01, 0.0, 1.0);
        let inputColor = sampleInputColor(uv);
        color = clamp(inputColor * intensity + color, vec3f(0.0), vec3f(1.0));
    }
    
    return vec4f(color, 1.0);
}
