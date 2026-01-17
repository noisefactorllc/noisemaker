/*
 * Rotate image 0..1 (0..360 degrees)
 */

struct Uniforms {
    rotation: f32,
    wrap: i32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.283185307179586;

fn rotate2D(angle: f32) -> mat2x2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat2x2<f32>(c, -s, s, c);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var uv = pos.xy / texSize;
    
    // Center, rotate, uncenter
    let center = vec2<f32>(0.5);
    uv -= center;
    uv = rotate2D(-uniforms.rotation * TAU / 360.0) * uv;
    uv += center;
    
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
