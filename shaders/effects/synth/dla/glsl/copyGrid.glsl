#version 300 es
precision highp float;

// Copy Pass - Blit grid to write buffer for proper blending

uniform sampler2D gridTex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    fragColor = texture(gridTex, uv);
}
