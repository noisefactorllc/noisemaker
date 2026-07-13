/*
 * Scatter - smooth pass: re-blends the jittered result from scatterJitter
 * with a 3x3 tent blur, mixed in by smoothness/100 (Spatter's
 * Smoothness parameter). smoothness = 0 leaves the pure per-pixel jitter
 * untouched; higher values soften the granular scatter into smoother
 * frosted streaks.
 */

struct Uniforms {
    smoothness: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texel = 1.0 / texSize;

    let src = textureSample(inputTex, inputSampler, uv);

    // 3x3 tent kernel: weight (2 - |x|) * (2 - |y|) for x, y in {-1, 0, 1},
    // giving weights 1/2/1 / 2/4/2 / 1/2/1 (sum 16).
    var sum = vec4<f32>(0.0);
    var wsum = 0.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let w = (2.0 - abs(f32(x))) * (2.0 - abs(f32(y)));
            sum += textureSample(inputTex, inputSampler, uv + vec2<f32>(f32(x), f32(y)) * texel) * w;
            wsum += w;
        }
    }
    let blurred = sum / wsum;

    return mix(src, blurred, clamp(uniforms.smoothness / 100.0, 0.0, 1.0));
}
