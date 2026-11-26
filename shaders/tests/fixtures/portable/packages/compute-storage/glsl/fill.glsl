#version 300 es
precision highp float;

// The fragment form of wgsl/fill.wgsl, which WebGL2 runs in place of the
// compute pass: red and green hold the pixel's position times spacing, out of
// 255.

uniform int spacing;

out vec4 workTex;

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    workTex = vec4(vec2(texel * spacing) / 255.0, 0.0, 1.0);
}
