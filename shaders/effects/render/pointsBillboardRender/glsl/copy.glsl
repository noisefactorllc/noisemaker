#version 300 es
precision highp float;

// Copy Pass - Blit source to destination (for ping-pong correction)

uniform sampler2D sourceTex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    fragColor = texture(sourceTex, uv);
}
