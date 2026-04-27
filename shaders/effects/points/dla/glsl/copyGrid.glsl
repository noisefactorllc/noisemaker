#version 300 es
precision highp float;

// Copy Pass - Blit grid to write buffer for proper blending

uniform sampler2D gridTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    fragColor = texture(gridTex, uv);
}
