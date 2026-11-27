#version 300 es
precision highp float;
uniform float speed;
out vec4 fragColor;
void main() { fragColor = vec4(speed); }
