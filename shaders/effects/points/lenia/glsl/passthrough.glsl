#version 300 es
precision highp float;

// Passthrough shader - copy input to output for 2D chain continuity

uniform sampler2D inputTex;

out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    fragColor = texelFetch(inputTex, coord, 0);
}
