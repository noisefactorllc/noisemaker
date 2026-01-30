#version 300 es
precision highp float;

// Clear pass - fill with background color (premultiplied alpha)

uniform vec3 bgColor;
uniform float bgAlpha;

out vec4 fragColor;

void main() {
    fragColor = vec4(bgColor * bgAlpha, bgAlpha);
}
