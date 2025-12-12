/*
 * WGSL depth of field shader.
 * Matches the luminance-derived depth simulation from the GLSL path for consistent bokeh patterns.
 * Pixel radius calculations are normalized to resolution to keep the blur kernel stable across devices.
 */

struct Uniforms {
    data : array<vec4<f32>, 2>,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var inputTex : texture_2d<f32>;
@group(0) @binding(3) var tex : texture_2d<f32>;

fn computeBlurFactor(depth: f32, focalDistance: f32, aperture: f32) -> f32 {
    let blur = abs(depth - (focalDistance * 0.01)) * aperture;
    return clamp(blur, 0.0, 1.0);
}

fn depthOfField(scene: texture_2d<f32>, depth: texture_2d<f32>, uv: vec2<f32>, resolution: vec2<f32>, focalDistance: f32, aperture: f32, sampleBias: f32) -> vec4<f32> {
    let depthValue = textureSample(depth, samp, uv);
    let luminosity = 0.2126 * depthValue.r + 0.7152 * depthValue.g + 0.0722 * depthValue.b;
    let blurFactor = computeBlurFactor(luminosity, focalDistance, aperture) * 10.0;
    var color = vec4<f32>(0.0);
    var totalWeight = 0.0;
    for (var x: i32 = -4; x <= 4; x = x + 1) {
        for (var y: i32 = -4; y <= 4; y = y + 1) {
            let offset = vec2<f32>(f32(x), f32(y)) * sampleBias / resolution;
            let weight = exp(-(f32(x) * f32(x) + f32(y) * f32(y)) / (2.0 * blurFactor * blurFactor));
            color = color + textureSample(scene, samp, uv + offset) * weight;
            totalWeight = totalWeight + weight;
        }
    }
    return color / totalWeight;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z; // unused
    let seed = uniforms.data[0].w; // unused
    let focalDistance = uniforms.data[1].x;
    let aperture = uniforms.data[1].y;
    let sampleBias = uniforms.data[1].z;
    let depthSource = i32(uniforms.data[1].w);

    var uv = pos.xy / resolution;
    uv.y = 1.0 - uv.y;

    var color: vec4<f32>;
    if (depthSource == 0) {
        color = depthOfField(tex, inputTex, uv, resolution, focalDistance, aperture, sampleBias);
    } else {
        color = depthOfField(inputTex, tex, uv, resolution, focalDistance, aperture, sampleBias);
    }

    let alpha1 = textureSample(inputTex, samp, uv).a;
    let alpha2 = textureSample(tex, samp, uv).a;
    color.a = max(alpha1, alpha2);
    return color;
}
