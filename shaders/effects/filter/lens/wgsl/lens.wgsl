/*
 * Lens distortion (barrel/pincushion)
 * Warps sample coordinates radially around the frame center.
 *
 * Tile-aware, mirroring glsl/lens.glsl. The non-tiling path
 * (tileOffset=(0,0)) is byte-identical to the previous shader, so
 * normal-size output is unchanged (zero baseline regression by
 * construction). When tiling, distortion is computed in GLOBAL frame
 * coordinates and the per-tile displacement is clamped to <=256px so the
 * sample stays within the tile overlap.
 */

struct Uniforms {
    lensDisplacement: f32,
    aspectLens: i32,
    antialias: i32,
    _pad3: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const HALF_FRAME: f32 = 0.5;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let tileOffset = uniforms.tileOffset;
    let dims = select(texSize, uniforms.fullResolution, uniforms.fullResolution.x > 0.0);
    let isTile = length(tileOffset) > 0.0;

    // Global UV when tiling; identical to pos.xy/texSize when not.
    let uv = (pos.xy + tileOffset) / dims;

    // Zoom for negative displacement (pincushion)
    var zoom: f32 = 0.0;
    if (uniforms.lensDisplacement < 0.0) {
        zoom = uniforms.lensDisplacement * -0.25;
    }

    // Distance from center, optionally aspect-corrected for circular distortion
    let aspect = dims.x / dims.y;
    let dist = uv - HALF_FRAME;
    var aDist = dist;
    if (uniforms.aspectLens != 0) { aDist.x = aDist.x * aspect; }

    let halfAspect = select(0.5, aspect * 0.5, uniforms.aspectLens != 0);
    let maxDist = length(vec2<f32>(halfAspect, 0.5));
    let distFromCenter = length(aDist);
    let normalizedDist = clamp(distFromCenter / maxDist, 0.0, 1.0);

    // Stronger effect near edges, weaker at center
    let centerWeight = 1.0 - normalizedDist;
    let centerWeightSq = centerWeight * centerWeight;

    // Apply radial distortion in aspect-corrected space
    var displacement = aDist * zoom + aDist * centerWeightSq * uniforms.lensDisplacement;

    // Convert displacement back to UV space
    if (uniforms.aspectLens != 0) { displacement.x = displacement.x / aspect; }

    if (isTile) {
        // Limit displacement so the sample stays within the tile overlap.
        let maxDispPixels = 256.0;
        let dispPixels = length(displacement * dims);
        if (dispPixels > maxDispPixels) {
            displacement = displacement * (maxDispPixels / dispPixels);
        }
        let warpedGlobalUV = uv - displacement;
        let offset = (warpedGlobalUV * dims - tileOffset) / texSize;
        if (uniforms.antialias != 0) {
            let dx = dpdx(offset);
            let dy = dpdy(offset);
            var col = vec4<f32>(0.0);
            col += textureSample(inputTex, inputSampler, offset + dx * -0.375 + dy * -0.125);
            col += textureSample(inputTex, inputSampler, offset + dx *  0.125 + dy * -0.375);
            col += textureSample(inputTex, inputSampler, offset + dx *  0.375 + dy *  0.125);
            col += textureSample(inputTex, inputSampler, offset + dx * -0.125 + dy *  0.375);
            return col * 0.25;
        }
        return textureSample(inputTex, inputSampler, offset);
    }

    // Non-tiling path: byte-identical to the previous shader.
    let offset = fract(uv - displacement);
    if (uniforms.antialias != 0) {
        let dx = dpdx(offset);
        let dy = dpdy(offset);
        var col = vec4<f32>(0.0);
        col += textureSample(inputTex, inputSampler, offset + dx * -0.375 + dy * -0.125);
        col += textureSample(inputTex, inputSampler, offset + dx *  0.125 + dy * -0.375);
        col += textureSample(inputTex, inputSampler, offset + dx *  0.375 + dy *  0.125);
        col += textureSample(inputTex, inputSampler, offset + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    }
    return textureSample(inputTex, inputSampler, offset);
}
