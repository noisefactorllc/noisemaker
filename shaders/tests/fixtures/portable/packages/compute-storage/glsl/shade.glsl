#version 300 es
precision highp float;

// The fragment form of wgsl/shade.wgsl: red and green from the work texture,
// blue the complement of red.

uniform sampler2D work;

out vec4 outputBuffer;

void main() {
    vec4 value = texelFetch(work, ivec2(gl_FragCoord.xy), 0);
    outputBuffer = vec4(value.r, value.g, 1.0 - value.r, 1.0);
}
