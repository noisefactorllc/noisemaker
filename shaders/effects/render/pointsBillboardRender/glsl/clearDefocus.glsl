#version 300 es
precision highp float;
uniform float clearValue;
out vec4 fragColor;
void main() {
    fragColor = vec4(clearValue);
}
