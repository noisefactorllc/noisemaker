/*
 * Edge detection with multiple kernels, sizes, and blend modes
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float kernel;
uniform float size;
uniform float blend;
uniform float invert;
uniform float channel;
uniform float threshold;
uniform float amount;
uniform float mixAmt;

out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float getWeight(int dx, int dy, int kernelType) {
    if (dx == 0 && dy == 0) return 0.0;

    if (kernelType == 0) {
        // fine: cardinal neighbors only (cross Laplacian)
        if (dx == 0 || dy == 0) return -1.0;
        return 0.0;
    } else {
        // bold: all neighbors equally
        return -1.0;
    }
}

vec4 applyBlend(vec4 edge, vec4 orig, int mode) {
    if (mode == 0) return min(orig + edge, vec4(1.0));                        // add
    if (mode == 1) return min(orig, edge);                                     // darken
    if (mode == 2) return abs(orig - edge);                                    // difference
    if (mode == 3) return min(orig / max(1.0 - edge, vec4(0.001)), vec4(1.0)); // dodge
    if (mode == 4) return max(orig, edge);                                     // lighten
    if (mode == 5) return orig * edge;                                         // multiply
    if (mode == 7) {                                                           // overlay
        vec4 result;
        result.r = orig.r < 0.5 ? 2.0 * orig.r * edge.r : 1.0 - 2.0 * (1.0 - orig.r) * (1.0 - edge.r);
        result.g = orig.g < 0.5 ? 2.0 * orig.g * edge.g : 1.0 - 2.0 * (1.0 - orig.g) * (1.0 - edge.g);
        result.b = orig.b < 0.5 ? 2.0 * orig.b * edge.b : 1.0 - 2.0 * (1.0 - orig.b) * (1.0 - edge.b);
        result.a = orig.a;
        return result;
    }
    if (mode == 8) return 1.0 - (1.0 - orig) * (1.0 - edge);                 // screen
    return edge;                                                                // normal (6)
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texelSize = 1.0 / resolution;

    vec4 origColor = texture(inputTex, uv);

    int kernelType = int(kernel);
    int radius = int(size) + 1; // 0->1, 1->2, 2->3
    int blendMode = int(blend);
    bool doInvert = invert > 0.5;
    bool useLuma = channel > 0.5;

    // Convolution
    vec3 conv = vec3(0.0);
    float centerWeight = 0.0;

    for (int dy = -3; dy <= 3; dy++) {
        for (int dx = -3; dx <= 3; dx++) {
            if (abs(dx) > radius || abs(dy) > radius) continue;
            if (dx == 0 && dy == 0) continue;

            float w = getWeight(dx, dy, kernelType);
            if (w == 0.0) continue;

            vec2 offset = vec2(float(dx), float(dy)) * texelSize;
            vec3 s = texture(inputTex, uv + offset).rgb;

            if (useLuma) {
                conv += vec3(dot(s, LUMA)) * w;
            } else {
                conv += s * w;
            }

            centerWeight -= w;
        }
    }

    // Center sample
    vec3 centerSample = origColor.rgb;
    if (useLuma) {
        centerSample = vec3(dot(centerSample, LUMA));
    }
    conv += centerSample * centerWeight;

    // Amount
    conv *= amount / 50.0;
    conv = clamp(conv, 0.0, 1.0);

    // Threshold (before invert so it measures actual edge strength)
    if (threshold > 0.0) {
        float thresh = threshold / 100.0;
        float edge;
        if (useLuma) {
            edge = conv.r;
        } else {
            edge = dot(conv, LUMA);
        }
        float mask = smoothstep(thresh - 0.01, thresh + 0.01, edge);
        conv *= mask;
    }

    // Invert
    if (doInvert) {
        conv = 1.0 - conv;
    }

    // Blend
    vec4 edgeColor = vec4(conv, origColor.a);
    vec4 blended = applyBlend(edgeColor, origColor, blendMode);

    // Mix
    float m = mixAmt / 100.0;
    fragColor = vec4(mix(origColor.rgb, blended.rgb, m), origColor.a);
}
