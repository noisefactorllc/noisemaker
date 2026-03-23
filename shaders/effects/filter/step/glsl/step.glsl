/*
 * Step threshold effect
 * Creates hard edge at threshold value
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float threshold;
uniform bool antialias;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    if (antialias) {
        vec3 fw = fwidth(color.rgb);
        color.rgb = smoothstep(threshold - fw * 0.5, threshold + fw * 0.5, color.rgb);
    } else {
        color.rgb = step(threshold, color.rgb);
    }

    fragColor = color;
}
