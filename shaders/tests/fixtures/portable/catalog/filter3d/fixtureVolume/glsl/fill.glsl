#version 300 es
precision highp float;
uniform float volumeSize;
out vec4 color;
void main() { color = vec4(volumeSize); }
