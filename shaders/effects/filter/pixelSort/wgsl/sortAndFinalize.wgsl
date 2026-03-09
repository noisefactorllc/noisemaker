/*
 * Pixel Sort - Sort and Finalize pass
 *
 * Full-row sorting (matches Python reference):
 * 1. Find brightest pixel in row (argmax)
 * 2. Count rank: how many pixels in the entire row are brighter
 * 3. Offset by brightest position: srcX = (rank + brightestX) % width
 * 4. Gather pixel at srcX
 * 5. Un-invert if darkest mode, rotate back, max-blend with original
 */

const PI: f32 = 3.141592653589793;

@group(0) @binding(0) var preparedTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> angle: f32;
@group(0) @binding(4) var<uniform> darkest: i32;
@group(0) @binding(5) var<uniform> alpha: f32;

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

    // Step 1: Find brightest pixel in row (argmax)
    var brightestX = 0;
    var brightestLum: f32 = -1.0;
    for (var i = 0; i < width; i = i + 1) {
        let lum = luminance(textureLoad(preparedTex, vec2<i32>(i, y), 0).rgb);
        if (lum > brightestLum) {
            brightestLum = lum;
            brightestX = i;
        }
    }

    // Step 2: Count rank (how many pixels in entire row are brighter)
    var rank = 0;
    for (var i = 0; i < width; i = i + 1) {
        let otherLum = luminance(textureLoad(preparedTex, vec2<i32>(i, y), 0).rgb);
        if (otherLum > myLum || (otherLum == myLum && i < x)) {
            rank = rank + 1;
        }
    }

    // Step 3: Offset by brightest position
    let srcX = (rank + brightestX) % width;

    // Step 4: Gather
    var sortedColor = textureLoad(preparedTex, vec2<i32>(srcX, y), 0);

    // Step 5: Un-invert if darkest mode
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
