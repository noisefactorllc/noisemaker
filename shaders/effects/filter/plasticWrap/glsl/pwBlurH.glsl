/*
 * Plastic Wrap - horizontal Gaussian pass.
 *
 * Blurs the source image; the result feeds pwBlurV, and the luminance of
 * that final blur serves as the height field h for the specular pass
 * (pwSpec). Blurring rgb here (rather than luminance directly) keeps this
 * pass generic/reusable and defers the lum() reduction to where h is
 * actually consumed.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float detail;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 dirPx = vec2(1.0, 0.0);
    // Higher detail -> smaller blur radius -> higher-frequency contours in
    // the height field -> finer, more numerous sheen streaks.
    float radius = mix(12.0, 2.0, detail / 100.0);
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
