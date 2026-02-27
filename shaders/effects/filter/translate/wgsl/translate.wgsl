/*
 * Translate image X and Y
 */

struct Uniforms {
    x: f32,
    y: f32,
    wrap: i32,
    _pad1: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var uv = pos.xy / texSize;
    
    // Apply translation
    uv.x = uv.x - uniforms.x;
    uv.y = uv.y - uniforms.y;
    
    // Apply wrap mode
    if (uniforms.wrap == 0) {
        // mirror
        uv = abs((uv % 2.0 + 2.0) % 2.0 - 1.0);
    } else if (uniforms.wrap == 1) {
        // repeat
        uv = (uv % 1.0 + 1.0) % 1.0;
    } else {
        // clamp
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    return textureSample(inputTex, inputSampler, uv);
}
