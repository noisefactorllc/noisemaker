#version 300 es
precision highp float;

// Copy the frame to the output, texel for texel.

uniform sampler2D frameTex;

out vec4 fragColor;

void main() {
    fragColor = texelFetch(frameTex, ivec2(gl_FragCoord.xy), 0);
}
