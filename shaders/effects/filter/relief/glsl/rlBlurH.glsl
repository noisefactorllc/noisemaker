/*
 * Relief - horizontal Gaussian pass.
 *
 * Separable Gaussian blur of the source image. The blurred result
 * feeds rlBlurV, and the luminance of that final blur becomes the height
 * field h consumed by rlShade. Blurring rgb here (rather than luminance
 * directly) keeps this pass generic/reusable, matching filter/plasticWrap's
 * pwBlurH/pwBlurV precedent; the lum() reduction happens once, downstream,
 * where h is actually used.
 *
 * radius = mix(0.5, 15.0, smoothness/100): higher smoothness -> larger
 * blur radius -> finer height-field detail is smoothed away -> coarser
 * relief (Bas Relief/Plaster/Note Paper "smoothness" slider).
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float smoothness;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 dirPx = vec2(1.0, 0.0);
    float radius = mix(0.5, 15.0, smoothness / 100.0);
    float sigma = max(radius * 0.5, 0.001);
    float fTaps = min(radius, 32.0);
    vec4 sum = texture(inputTex, uv);
    float wsum = 1.0;
    for (int i = 1; i <= 32; i++) {
        if (float(i) > fTaps) { break; }
        float w = exp(-float(i * i) / (2.0 * sigma * sigma));
        vec2 o = dirPx * float(i) / resolution;
        sum += (texture(inputTex, uv + o) + texture(inputTex, uv - o)) * w;
        wsum += 2.0 * w;
    }
    fragColor = sum / wsum;
}
