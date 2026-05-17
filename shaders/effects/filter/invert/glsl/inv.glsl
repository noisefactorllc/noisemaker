/*
 * Invert brightness effect
 * Simple RGB inversion: 1.0 - value
 */

#ifdef GL_ES
precision highp float;
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    color.rgb = 1.0 - color.rgb;

    fragColor = color;
}
