#version 300 es
precision highp float;

uniform sampler2D tex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    fragColor = texture(tex, uv);
}
