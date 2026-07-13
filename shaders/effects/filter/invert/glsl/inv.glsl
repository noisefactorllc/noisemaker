/*
 * Invert brightness effect
 * mode 0 (full, default): simple RGB inversion, 1.0 - value
 * mode 1 (solarize): Solarize parity, min(v, 1.0 - v) per channel
 *   (PS: output = v <= 128 ? v : 255 - v, equivalent to min(v, 1-v) in 0..1)
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int mode;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    if (mode == 1) {
        color.rgb = min(color.rgb, 1.0 - color.rgb);
    } else {
        color.rgb = 1.0 - color.rgb;
    }

    fragColor = color;
}
