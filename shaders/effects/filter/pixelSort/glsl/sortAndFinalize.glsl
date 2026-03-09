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

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D preparedTex;
uniform sampler2D inputTex;
uniform float angle;
uniform bool darkest;
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

    ivec2 coord = ivec2(gl_FragCoord.xy);
    int x = coord.x;
    int y = coord.y;

    float myLum = luminance(texelFetch(preparedTex, coord, 0).rgb);

    // Step 1: Find brightest pixel in row (argmax)
    int brightestX = 0;
    float brightestLum = -1.0;
    for (int i = 0; i < width; i++) {
        float lum = luminance(texelFetch(preparedTex, ivec2(i, y), 0).rgb);
        if (lum > brightestLum) {
            brightestLum = lum;
            brightestX = i;
        }
    }

    // Step 2: Count rank (how many pixels in entire row are brighter)
    int rank = 0;
    for (int i = 0; i < width; i++) {
        float otherLum = luminance(texelFetch(preparedTex, ivec2(i, y), 0).rgb);
        if (otherLum > myLum || (otherLum == myLum && i < x)) {
            rank++;
        }
    }

    // Step 3: Offset by brightest position
    int srcX = (rank + brightestX) % width;

    // Step 4: Gather
    vec4 sortedColor = texelFetch(preparedTex, ivec2(srcX, y), 0);

    // Step 5: Un-invert if darkest mode
    if (darkest) {
        sortedColor.rgb = 1.0 - sortedColor.rgb;
    }

    // Rotate back to original orientation
    vec2 pixelCoord = gl_FragCoord.xy - center;
    float rad = angle * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);

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
