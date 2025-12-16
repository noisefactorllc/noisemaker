#version 300 es
precision highp float;

uniform sampler2D tex;
out vec4 outColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 val = texelFetch(tex, coord, 0);
    // Clamp to prevent runaway accumulation
    outColor = min(val, vec4(6.0));
}
