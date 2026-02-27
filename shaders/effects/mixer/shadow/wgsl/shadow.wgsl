/*
 * Shadow / Glow mixer shader (WGSL)
 *
 * Uses one input as a mask to cast an offset, blurred shadow or glow
 * onto the other input. The mask channel is thresholded, then the
 * resulting silhouette is offset, blurred, and spread to form the shadow.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> maskSource: i32;
@group(0) @binding(4) var<uniform> sourceChannel: i32;
@group(0) @binding(5) var<uniform> threshold: f32;
@group(0) @binding(6) var<uniform> color: vec3<f32>;
@group(0) @binding(7) var<uniform> offsetX: f32;
@group(0) @binding(8) var<uniform> offsetY: f32;
@group(0) @binding(9) var<uniform> blur: f32;
@group(0) @binding(10) var<uniform> spread: f32;
@group(0) @binding(11) var<uniform> wrap: i32;

// Extract a single channel from a color
fn getChannel(color: vec4<f32>, channel: i32) -> f32 {
    if (channel == 0) { return color.r; }
    if (channel == 1) { return color.g; }
    if (channel == 2) { return color.b; }
    return color.a;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;

    // Base image is the non-mask source
    var baseColor: vec4<f32>;
    if (maskSource == 0) {
        baseColor = textureSample(tex, samp, uv);
    } else {
        baseColor = textureSample(inputTex, samp, uv);
    }

    // Mask UV shifted by shadow offset
    let maskUV = uv - vec2<f32>(offsetX, offsetY) * 0.1;

    // Gaussian blur of thresholded mask
    var shadowMask: f32 = 0.0;
    var totalWeight: f32 = 0.0;

    let sigma = max(blur, 0.001);
    let sigma2 = 2.0 * sigma * sigma;

    for (var x: i32 = -5; x <= 5; x = x + 1) {
        for (var y: i32 = -5; y <= 5; y = y + 1) {
            let offset = vec2<f32>(f32(x), f32(y)) * blur / dims;
            let sampleUV = maskUV + offset;

            // Apply wrap mode to sample UVs
            var thresholded: f32 = 0.0;
            if (wrap == 0) {
                // hide: treat out-of-bounds as empty
                if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
                    var maskSample: vec4<f32>;
                    if (maskSource == 0) {
                        maskSample = textureSample(inputTex, samp, sampleUV);
                    } else {
                        maskSample = textureSample(tex, samp, sampleUV);
                    }
                    thresholded = step(threshold, getChannel(maskSample, sourceChannel));
                }
            } else {
                var wrappedUV = sampleUV;
                if (wrap == 1) {
                    // mirror
                    wrappedUV = abs((sampleUV % 2.0 + 2.0) % 2.0 - 1.0);
                } else if (wrap == 2) {
                    // repeat
                    wrappedUV = (sampleUV % 1.0 + 1.0) % 1.0;
                } else {
                    // clamp
                    wrappedUV = clamp(sampleUV, vec2<f32>(0.0), vec2<f32>(1.0));
                }
                var maskSample: vec4<f32>;
                if (maskSource == 0) {
                    maskSample = textureSample(inputTex, samp, wrappedUV);
                } else {
                    maskSample = textureSample(tex, samp, wrappedUV);
                }
                thresholded = step(threshold, getChannel(maskSample, sourceChannel));
            }

            let dist2 = f32(x * x + y * y);
            let weight = exp(-dist2 / sigma2);

            shadowMask = shadowMask + thresholded * weight;
            totalWeight = totalWeight + weight;
        }
    }
    shadowMask = shadowMask / totalWeight;

    // Spread amplifies the mask to expand the shadow
    shadowMask = clamp(shadowMask * (1.0 + spread), 0.0, 1.0);

    // Composite shadow onto base
    let withShadow = mix(baseColor.rgb, color, shadowMask);

    // Composite mask source (foreground) on top of the shadow
    var fgSample: vec4<f32>;
    if (maskSource == 0) {
        fgSample = textureSample(inputTex, samp, uv);
    } else {
        fgSample = textureSample(tex, samp, uv);
    }
    let fgMask = step(threshold, getChannel(fgSample, sourceChannel));
    let result = mix(withShadow, fgSample.rgb, fgMask);

    return vec4<f32>(result, baseColor.a);
}
