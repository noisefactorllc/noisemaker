/*
 * Smooth - Edge Detection Pass
 * SMAA/Blur modes: compute luma edge map (horizontal/vertical edges)
 * MSAA mode: pass through input unchanged
 */

struct Uniforms {
    data: array<vec4<f32>, 2>,
    // data[0].x = smoothType, data[0].y = strength, data[0].z = threshold, data[0].w = samples
    // data[1].x = searchSteps, data[1].y = radius
};

const LUMA_WEIGHTS: vec3<f32> = vec3<f32>(0.299, 0.587, 0.114);

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, LUMA_WEIGHTS);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let smoothType = i32(uniforms.data[0].x);
    let threshold = uniforms.data[0].z;

    let size = vec2<i32>(textureDimensions(inputTex, 0));
    let coord = vec2<i32>(i32(pos.x), i32(pos.y));

    // MSAA mode: pass through input (blend pass does its own edge detection)
    if (smoothType == 0) {
        return textureLoad(inputTex, coord, 0);
    }

    // SMAA and Blur modes: luma-based edge detection
    let maxCoord = size - vec2<i32>(1);
    let L  = luminance(textureLoad(inputTex, coord, 0).rgb);
    let Ln = luminance(textureLoad(inputTex, clamp(coord + vec2<i32>(0, -1), vec2<i32>(0), maxCoord), 0).rgb);
    let Ls = luminance(textureLoad(inputTex, clamp(coord + vec2<i32>(0,  1), vec2<i32>(0), maxCoord), 0).rgb);
    let Lw = luminance(textureLoad(inputTex, clamp(coord + vec2<i32>(-1, 0), vec2<i32>(0), maxCoord), 0).rgb);
    let Le = luminance(textureLoad(inputTex, clamp(coord + vec2<i32>( 1, 0), vec2<i32>(0), maxCoord), 0).rgb);

    let edgeH = step(threshold, max(abs(L - Ln), abs(L - Ls)));
    let edgeV = step(threshold, max(abs(L - Lw), abs(L - Le)));

    return vec4<f32>(edgeH, edgeV, 0.0, 1.0);
}
