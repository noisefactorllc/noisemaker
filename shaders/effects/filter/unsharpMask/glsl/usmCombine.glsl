/*
 * Unsharp mask - combine pass: out = img + amount * (img - blur), threshold-gated
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D blurTex;
uniform vec2 resolution;
uniform float amount;
uniform float threshold;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 src = texture(inputTex, uv);
    vec4 blur = texture(blurTex, uv);
    vec3 diff = src.rgb - blur.rgb;
    // Soft threshold gate (PS levels 0-255 mapped to 0-100 param): fade in the
    // effect over a half-level band above the threshold to avoid banding.
    float t = threshold / 100.0;
    float mag = max(max(abs(diff.r), abs(diff.g)), abs(diff.b));
    float gate = smoothstep(t, t + 0.02, mag);
    vec3 outc = src.rgb + diff * (amount / 100.0) * gate;
    fragColor = vec4(clamp(outc, 0.0, 1.0), src.a);
}
