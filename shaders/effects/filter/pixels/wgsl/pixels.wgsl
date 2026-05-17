/*
 * Pixelation effect
 * Reduces image resolution for retro pixel art look.
 *
 * Tile-aware, mirroring glsl/pixels.glsl: when tiling, the pixel grid is
 * computed in GLOBAL coordinates so blocks align across tiles. The
 * non-tiling branch (tileOffset=(0,0)) is the previous shader verbatim,
 * so normal-size output is byte-identical (zero baseline regression by
 * construction).
 */

struct Uniforms {
    size: f32,
    _pad0: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
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
    let isTile = length(uniforms.tileOffset) > 0.0;

    if (isTile) {
        let resolution = select(texSize, uniforms.fullResolution, uniforms.fullResolution.x > 0.0);
        let dx = pixelSize / resolution.x;
        let dy = pixelSize / resolution.y;
        // Snap on a global grid so blocks align across tiles.
        let globalUV = (pos.xy + uniforms.tileOffset) / resolution;
        let centered = globalUV - 0.5;
        var gcoord = vec2<f32>(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
        gcoord = gcoord + 0.5;
        let coord = (gcoord * resolution - uniforms.tileOffset) / texSize;
        return textureSample(inputTex, inputSampler, coord);
    }

    // Non-tiling path: byte-identical to the previous shader.
    let dx = pixelSize / texSize.x;
    let dy = pixelSize / texSize.y;
    var centered = uv - 0.5;
    var coord = vec2<f32>(dx * floor(centered.x / dx), dy * floor(centered.y / dy));
    coord = coord + 0.5;
    return textureSample(inputTex, inputSampler, coord);
}
