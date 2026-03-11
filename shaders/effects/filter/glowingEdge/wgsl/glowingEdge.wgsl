/*
 * Glowing Edge - single-pass Sobel edge detection with glow
 */

struct Uniforms {
    sobelMetric: f32,
    alpha: f32,
    width: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
}

fn distance_metric(gx: f32, gy: f32, metric: i32) -> f32 {
    let abs_gx = abs(gx);
    let abs_gy = abs(gy);

    if (metric == 1) {
        return abs_gx + abs_gy;  // Manhattan
    } else if (metric == 2) {
        return max(abs_gx, abs_gy);  // Chebyshev
    } else if (metric == 3) {
        let cross_val = (abs_gx + abs_gy) / 1.414;
        return max(cross_val, max(abs_gx, abs_gy));  // Minkowski
    }
    return sqrt(gx * gx + gy * gy);  // Euclidean (0)
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texel = uniforms.width / texSize;

    // Sample base color
    let base = textureSample(inputTex, inputSampler, uv);

    // Sample 3x3 neighborhood for Sobel
    let tl = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(-texel.x, -texel.y)).rgb);
    let tc = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, -texel.y)).rgb);
    let tr = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(texel.x, -texel.y)).rgb);
    let ml = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(-texel.x, 0.0)).rgb);
    let mr = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(texel.x, 0.0)).rgb);
    let bl = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(-texel.x, texel.y)).rgb);
    let bc = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(0.0, texel.y)).rgb);
    let br = luminance(textureSample(inputTex, inputSampler, uv + vec2<f32>(texel.x, texel.y)).rgb);

    // Sobel kernels
    let gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;

    // Edge magnitude
    let metric = i32(uniforms.sobelMetric);
    let edge = clamp(distance_metric(gx, gy, metric) * 3.0, 0.0, 1.0);

    // Glow: edges emit the base color as additive light
    let glow = edge * base.rgb * 2.0;

    // Screen blend glow onto original
    let result = vec3<f32>(1.0) - (vec3<f32>(1.0) - base.rgb) * (vec3<f32>(1.0) - glow);

    // Mix based on alpha
    let mixed = mix(base.rgb, result, uniforms.alpha);

    return vec4<f32>(clamp(mixed, vec3<f32>(0.0), vec3<f32>(1.0)), base.a);
}
