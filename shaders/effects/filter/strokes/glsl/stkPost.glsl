/*
 * Strokes - stkPost pass: unsharp-sharpens the smeared result from
 * stkSmear (see glsl/stkSmear.glsl) by `sharpness`, using a 3x3 tent blur
 * as the unsharp mask's low-pass reference (same shape as
 * filter/oilPaint's tent3x3 helper, shared by its daubs/knife modes).
 * Alpha passes through from the original source (inputTex), matching
 * every other multi-pass filter in this plan.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D smearTex;
uniform vec2 resolution;
uniform float sharpness;

out vec4 fragColor;

// 3x3 tent blur of the smeared texture - same shape as filter/oilPaint's
// tent3x3 (daubs unsharp / knife soften).
vec3 tent3x3(vec2 uv) {
    vec2 px = 1.0 / resolution;
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            float w = (dx == 0 ? 2.0 : 1.0) * (dy == 0 ? 2.0 : 1.0);
            sum += texture(smearTex, uv + vec2(float(dx), float(dy)) * px).rgb * w;
            wsum += w;
        }
    }
    return sum / wsum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec3 c = texture(smearTex, uv).rgb;

    vec3 tent = tent3x3(uv);
    vec3 sharpened = c + (c - tent) * (sharpness / 33.0);

    fragColor = vec4(clamp(sharpened, 0.0, 1.0), src.a);
}
