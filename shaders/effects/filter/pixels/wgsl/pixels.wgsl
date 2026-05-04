/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look
 */

struct Uniforms {
    size: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let fullRes = select(texSize, uniforms.fullResolution, uniforms.fullResolution.x > 0.0);
    let uv = pos.xy / texSize;

    if (uniforms.size < 1.0) {
        return textureSample(inputTex, inputSampler, uv);
    }

    let pixelSize = uniforms.size;

    let dx = pixelSize / fullRes.x;
    let dy = pixelSize / fullRes.y;

    // Use global UV so pixel grid aligns across tiles
    let posFromBottom = vec2<f32>(pos.x, texSize.y - pos.y);
    let globalUV = (posFromBottom + uniforms.tileOffset) / fullRes;
    let centered = globalUV - 0.5;
    var globalCoord = vec2<f32>(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    globalCoord = globalCoord + 0.5;

    // Convert back to tile-local UV for sampling
    let coord = (globalCoord * fullRes - uniforms.tileOffset) / texSize;

    return textureSample(inputTex, inputSampler, coord);
}
