/*
 * Smoothstep threshold effect
 * Creates smooth transition between edge0 and edge1
 */

#ifdef GL_ES
precision highp float;
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform float edge0;
uniform float edge1;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    color.rgb = smoothstep(edge0, edge1, color.rgb);

    fragColor = color;
}
