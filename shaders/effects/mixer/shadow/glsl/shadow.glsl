/*
 * Shadow / Glow mixer shader
 *
 * Uses one input as a mask to cast an offset, blurred shadow or glow
 * onto the other input. The mask channel is thresholded, then the
 * resulting silhouette is offset, blurred, and spread to form the shadow.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int shadowMaskSource;
uniform int shadowSourceChannel;
uniform float shadowThreshold;
uniform vec3 shadowColor;
uniform float shadowOffsetX;
uniform float shadowOffsetY;
uniform float shadowBlur;
uniform float shadowSpread;
uniform int shadowWrap;

out vec4 fragColor;

// Extract a single channel from a color
float getChannel(vec4 color, int channel) {
    if (channel == 0) return color.r;
    if (channel == 1) return color.g;
    if (channel == 2) return color.b;
    return color.a;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    // Base image is the non-mask source
    vec4 baseColor = (shadowMaskSource == 0) ? texture(tex, uv) : texture(inputTex, uv);

    // Mask UV shifted by shadow offset
    vec2 maskUV = uv - vec2(shadowOffsetX, shadowOffsetY) * 0.1;

    // Gaussian blur of thresholded mask
    float shadowMask = 0.0;
    float totalWeight = 0.0;

    float sigma = max(shadowBlur, 0.001);
    float sigma2 = 2.0 * sigma * sigma;

    for (int x = -5; x <= 5; x++) {
        for (int y = -5; y <= 5; y++) {
            vec2 offset = vec2(float(x), float(y)) * shadowBlur / resolution;
            vec2 sampleUV = maskUV + offset;

            // Apply wrap mode to sample UVs
            float thresholded = 0.0;
            if (shadowWrap == 0) {
                // hide: treat out-of-bounds as empty
                if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
                    vec4 maskSample = (shadowMaskSource == 0)
                        ? texture(inputTex, sampleUV)
                        : texture(tex, sampleUV);
                    thresholded = step(shadowThreshold, getChannel(maskSample, shadowSourceChannel));
                }
            } else {
                vec2 wrappedUV = sampleUV;
                if (shadowWrap == 1) {
                    // mirror
                    wrappedUV = abs(mod(sampleUV + 1.0, 2.0) - 1.0);
                } else if (shadowWrap == 2) {
                    // repeat
                    wrappedUV = fract(sampleUV);
                } else {
                    // clamp
                    wrappedUV = clamp(sampleUV, 0.0, 1.0);
                }
                vec4 maskSample = (shadowMaskSource == 0)
                    ? texture(inputTex, wrappedUV)
                    : texture(tex, wrappedUV);
                thresholded = step(shadowThreshold, getChannel(maskSample, shadowSourceChannel));
            }

            float dist2 = float(x * x + y * y);
            float weight = exp(-dist2 / sigma2);

            shadowMask += thresholded * weight;
            totalWeight += weight;
        }
    }
    shadowMask /= totalWeight;

    // Spread amplifies the mask to expand the shadow
    shadowMask = clamp(shadowMask * (1.0 + shadowSpread), 0.0, 1.0);

    // Composite shadow onto base
    vec3 withShadow = mix(baseColor.rgb, shadowColor, shadowMask);

    // Composite mask source (foreground) on top of the shadow
    vec4 fgSample = (shadowMaskSource == 0)
        ? texture(inputTex, uv)
        : texture(tex, uv);
    float fgMask = step(shadowThreshold, getChannel(fgSample, shadowSourceChannel));
    vec3 result = mix(withShadow, fgSample.rgb, fgMask);

    fragColor = vec4(result, baseColor.a);
}
