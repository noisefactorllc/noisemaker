/*
 * Sine wave distortion
 * RGB mode: apply sine to R, G, B independently
 * Non-RGB mode: convert to luminance, apply sine, output grayscale
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float amount;
uniform float colorMode;

out vec4 fragColor;

float normalized_sine(float value) {
    return (sin(value) + 1.0) * 0.5;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    bool use_rgb = colorMode > 0.5;

    if (use_rgb) {
        color.r = normalized_sine(color.r * amount);
        color.g = normalized_sine(color.g * amount);
        color.b = normalized_sine(color.b * amount);
    } else {
        float lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
        float result = normalized_sine(lum * amount);
        color.rgb = vec3(result);
    }

    fragColor = color;
}
