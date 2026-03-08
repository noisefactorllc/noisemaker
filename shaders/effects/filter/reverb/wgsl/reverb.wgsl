// Simple reverb effect: blend input with scaled-down version of itself.
// Each pass samples the previous result at 50% scale and blends.

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> iterations: i32;
@group(0) @binding(3) var<uniform> ridges: i32;
@group(0) @binding(4) var<uniform> alpha: f32;

fn ridge_transform(color: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(1.0) - abs(color * 2.0 - vec4<f32>(1.0));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dimsU: vec2<u32> = textureDimensions(inputTex, 0);
    let dims: vec2<f32> = vec2<f32>(f32(dimsU.x), f32(dimsU.y));
    let uv: vec2<f32> = pos.xy / dims;

    // Save original input for alpha blending
    let original: vec4<f32> = textureSample(inputTex, inputSampler, uv);

    // Sample at current position
    var current: vec4<f32> = original;

    // Apply ridge transform if enabled
    let useRidges: bool = ridges != 0;
    if (useRidges) {
        current = ridge_transform(current);
    }

    // Accumulate multiple scaled samples based on iterations
    var accum: vec4<f32> = current;
    var totalWeight: f32 = 1.0;
    var weight: f32 = 0.5;
    var scale: f32 = 2.0;

    let iters: i32 = clamp(iterations, 1, 8);
    for (var i: i32 = 0; i < iters; i = i + 1) {
        let scaledUV: vec2<f32> = fract(uv * scale);
        var scaled: vec4<f32> = textureSample(inputTex, inputSampler, scaledUV);

        if (useRidges) {
            scaled = ridge_transform(scaled);
        }

        accum = accum + scaled * weight;
        totalWeight = totalWeight + weight;

        scale = scale * 2.0;
        weight = weight * 0.5;
    }

    let result: vec4<f32> = accum / totalWeight;

    return vec4<f32>(mix(original.rgb, result.rgb, alpha), 1.0);
}
