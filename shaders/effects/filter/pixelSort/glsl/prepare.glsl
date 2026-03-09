/*
 * Pixel Sort - Prepare pass
 * Rotate input by angle, optionally invert for darkest-first mode
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float angle;
uniform bool darkest;

out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 size = vec2(texSize);
    vec2 center = size * 0.5;
    vec2 pixelCoord = gl_FragCoord.xy - center;

    float rad = angle * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);

    // Inverse rotation to find source coordinate
    vec2 srcCoord;
    srcCoord.x = c * pixelCoord.x + s * pixelCoord.y;
    srcCoord.y = -s * pixelCoord.x + c * pixelCoord.y;
    srcCoord += center;

    vec4 color;
    if (srcCoord.x < 0.0 || srcCoord.x >= size.x || srcCoord.y < 0.0 || srcCoord.y >= size.y) {
        color = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        color = texelFetch(inputTex, ivec2(srcCoord), 0);
    }

    if (darkest) {
        color.rgb = 1.0 - color.rgb;
    }

    fragColor = color;
}
