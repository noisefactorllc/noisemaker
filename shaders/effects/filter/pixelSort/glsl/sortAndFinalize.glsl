/*
 * Pixel Sort - Sort and Finalize pass
 *
 * For each pixel in the rotated image:
 * 1. Find the contiguous run of bright pixels (above threshold) containing this pixel
 * 2. Compute this pixel's rank within the run (count of brighter pixels)
 * 3. Gather the pixel at the ranked position within the run
 * 4. Rotate back and blend with original
 *
 * Matches Python reference: row-based sorting with brightest-alignment and max blend.
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D preparedTex;
uniform sampler2D inputTex;
uniform float angle;
uniform bool darkest;
uniform float threshold;
uniform float alpha;

out vec4 fragColor;

const float PI = 3.141592653589793;

float luminance(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    ivec2 prepSize = textureSize(preparedTex, 0);
    vec2 size = vec2(prepSize);
    vec2 center = size * 0.5;
    int width = prepSize.x;

    // Current pixel in output space = rotated space
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int x = coord.x;
    int y = coord.y;

    float myLum = luminance(texelFetch(preparedTex, coord, 0).rgb);

    // Default: pass through the prepared pixel
    vec4 sortedColor = texelFetch(preparedTex, coord, 0);

    // Only sort pixels above threshold
    if (myLum >= threshold) {
        // Find run boundaries: contiguous bright pixels in this row
        int runStart = x;
        int runEnd = x;

        // Scan left to find run start
        for (int i = x - 1; i >= max(0, x - 512); i--) {
            float lum = luminance(texelFetch(preparedTex, ivec2(i, y), 0).rgb);
            if (lum < threshold) break;
            runStart = i;
        }

        // Scan right to find run end
        for (int i = x + 1; i <= min(width - 1, x + 512); i++) {
            float lum = luminance(texelFetch(preparedTex, ivec2(i, y), 0).rgb);
            if (lum < threshold) break;
            runEnd = i;
        }

        int runLen = runEnd - runStart + 1;

        if (runLen > 1) {
            // Count how many pixels in this run are brighter than me
            // (or same brightness but earlier in row = stable sort)
            int rank = 0;
            for (int i = runStart; i <= runEnd; i++) {
                float otherLum = luminance(texelFetch(preparedTex, ivec2(i, y), 0).rgb);
                if (otherLum > myLum || (otherLum == myLum && i < x)) {
                    rank++;
                }
            }

            // Gather: pixel at position (runStart + rank) in the sorted order
            // rank 0 = brightest, so position runStart + rank
            int srcX = runStart + rank;
            srcX = clamp(srcX, runStart, runEnd);
            sortedColor = texelFetch(preparedTex, ivec2(srcX, y), 0);
        }
    }

    // Un-invert if darkest mode
    if (darkest) {
        sortedColor.rgb = 1.0 - sortedColor.rgb;
    }

    // Rotate back to original orientation
    vec2 pixelCoord = gl_FragCoord.xy - center;
    float rad = angle * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);

    // Forward rotation (inverse of prepare's inverse)
    vec2 origCoord;
    origCoord.x = c * pixelCoord.x - s * pixelCoord.y;
    origCoord.y = s * pixelCoord.x + c * pixelCoord.y;
    origCoord += center;

    // Get original pixel for blending
    ivec2 origTexSize = textureSize(inputTex, 0);
    vec2 origSize = vec2(origTexSize);
    vec2 origUV = origCoord / origSize;
    vec4 originalColor = texture(inputTex, origUV);

    // Max blend (matching Python reference)
    vec4 blended = vec4(max(originalColor.rgb, sortedColor.rgb), originalColor.a);

    // Alpha blend with original
    fragColor = mix(originalColor, blended, alpha);
}
