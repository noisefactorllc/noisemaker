/*
 * Simple copy/blit shader - copies input to output unchanged.
 * Used for feedback texture updates.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    fragColor = texture(inputTex, uv);
}
