/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look
 */

struct Uniforms {
    size: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    if (uniforms.size < 1.0) {
        return textureSample(inputTex, inputSampler, uv);
    }
    
    let pixelSize = uniforms.size;
    
    let dx = pixelSize / texSize.x;
    let dy = pixelSize / texSize.y;
    
    var centered = uv - 0.5;
    var coord = vec2<f32>(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    coord = coord + 0.5;
    
    return textureSample(inputTex, inputSampler, coord);
}
