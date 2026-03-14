/*
 * Lens distortion (barrel/pincushion)
 * Warps sample coordinates radially around the frame center
 */

struct Uniforms {
    lensDisplacement: f32,
    aspectLens: i32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const HALF_FRAME: f32 = 0.5;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    // Zoom for negative displacement (pincushion)
    var zoom: f32 = 0.0;
    if (uniforms.lensDisplacement < 0.0) {
        zoom = uniforms.lensDisplacement * -0.25;
    }

    // Distance from center, optionally aspect-corrected for circular distortion
    let aspect = texSize.x / texSize.y;
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

    let offset = fract(uv - displacement);

    return textureSample(inputTex, inputSampler, offset);
}
