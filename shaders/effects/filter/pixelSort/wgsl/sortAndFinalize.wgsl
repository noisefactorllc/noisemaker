/*
 * Pixel Sort - Sort and Finalize pass
 *
 * For each pixel in the rotated image:
 * 1. Find the contiguous run of bright pixels (above threshold) containing this pixel
 * 2. Compute this pixel's rank within the run (count of brighter pixels)
 * 3. Gather the pixel at the ranked position within the run
 * 4. Rotate back and blend with original
 */

const PI: f32 = 3.141592653589793;

@group(0) @binding(0) var preparedTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> angle: f32;
@group(0) @binding(4) var<uniform> darkest: i32;
@group(0) @binding(5) var<uniform> threshold: f32;
@group(0) @binding(6) var<uniform> alpha: f32;

fn luminance(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let prepSize = vec2<i32>(textureDimensions(preparedTex));
    let size = vec2<f32>(prepSize);
    let center = size * 0.5;
    let width = prepSize.x;

    let coord = vec2<i32>(pos.xy);
    let x = coord.x;
    let y = coord.y;

    let myLum = luminance(textureLoad(preparedTex, coord, 0).rgb);

    // Default: pass through the prepared pixel
    var sortedColor = textureLoad(preparedTex, coord, 0);

    // Only sort pixels above threshold
    if (myLum >= threshold) {
        // Find run boundaries: contiguous bright pixels in this row
        var runStart = x;
        var runEnd = x;

        // Scan left to find run start
        let leftLimit = max(0, x - 512);
        for (var i = x - 1; i >= leftLimit; i = i - 1) {
            let lum = luminance(textureLoad(preparedTex, vec2<i32>(i, y), 0).rgb);
            if (lum < threshold) { break; }
            runStart = i;
        }

        // Scan right to find run end
        let rightLimit = min(width - 1, x + 512);
        for (var i = x + 1; i <= rightLimit; i = i + 1) {
            let lum = luminance(textureLoad(preparedTex, vec2<i32>(i, y), 0).rgb);
            if (lum < threshold) { break; }
            runEnd = i;
        }

        let runLen = runEnd - runStart + 1;

        if (runLen > 1) {
            // Count how many pixels in this run are brighter than me
            var rank = 0;
            for (var i = runStart; i <= runEnd; i = i + 1) {
                let otherLum = luminance(textureLoad(preparedTex, vec2<i32>(i, y), 0).rgb);
                if (otherLum > myLum || (otherLum == myLum && i < x)) {
                    rank = rank + 1;
                }
            }

            // Gather: pixel at position (runStart + rank)
            var srcX = runStart + rank;
            srcX = clamp(srcX, runStart, runEnd);
            sortedColor = textureLoad(preparedTex, vec2<i32>(srcX, y), 0);
        }
    }

    // Un-invert if darkest mode
    if (darkest != 0) {
        sortedColor = vec4<f32>(1.0 - sortedColor.r, 1.0 - sortedColor.g, 1.0 - sortedColor.b, sortedColor.a);
    }

    // Rotate back to original orientation
    let pixelCoord = pos.xy - center;
    let rad = angle * PI / 180.0;
    let c = cos(rad);
    let s = sin(rad);

    let origCoord = vec2<f32>(
        c * pixelCoord.x - s * pixelCoord.y,
        s * pixelCoord.x + c * pixelCoord.y
    ) + center;

    // Get original pixel for blending
    let origSize = vec2<f32>(textureDimensions(inputTex));
    let origUV = origCoord / origSize;
    let originalColor = textureSample(inputTex, inputSampler, origUV);

    // Max blend (matching Python reference)
    let blended = vec4<f32>(max(originalColor.rgb, sortedColor.rgb), originalColor.a);

    // Alpha blend with original
    return mix(originalColor, blended, alpha);
}
