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

    // Use textureSampleLevel because noisemaker textures are rgba16float —
    // unfilterable on WebGPU without the float32-filterable feature, which
    // makes plain textureSample reject the auto-generated bind-group layout.
    // textureSampleLevel takes an explicit mip level so no derivatives or
    // filtering are needed.

    // Sample base color
    let base = textureSampleLevel(inputTex, inputSampler, uv, 0.0);

    // Sample 3x3 neighborhood for Sobel
    let tl = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(-texel.x, -texel.y), 0.0).rgb);
    let tc = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(0.0, -texel.y), 0.0).rgb);
    let tr = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(texel.x, -texel.y), 0.0).rgb);
    let ml = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(-texel.x, 0.0), 0.0).rgb);
    let mr = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(texel.x, 0.0), 0.0).rgb);
    let bl = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(-texel.x, texel.y), 0.0).rgb);
    let bc = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(0.0, texel.y), 0.0).rgb);
    let br = luminance(textureSampleLevel(inputTex, inputSampler, uv + vec2<f32>(texel.x, texel.y), 0.0).rgb);

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
