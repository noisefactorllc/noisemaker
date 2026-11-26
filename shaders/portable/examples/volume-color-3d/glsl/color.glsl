#version 300 es
precision highp float;
uniform sampler2D volumeInput;
uniform float amount;
out vec4 color;
void main() {
    vec4 source = texelFetch(volumeInput, ivec2(gl_FragCoord.xy), 0);
    vec2 tint = vec2(source.r * 0.4, source.r * 0.85);
    color = vec4(source.r, mix(source.gb, tint, amount), source.a);
}
