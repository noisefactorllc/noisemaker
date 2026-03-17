#version 300 es
precision highp float;

uniform sampler2D rTex;
uniform sampler2D gTex;
uniform sampler2D bTex;
uniform vec2 resolution;
uniform float rLevel;
uniform float gLevel;
uniform float bLevel;
out vec4 fragColor;

float luminance(vec4 c) {
    return dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    float r = luminance(texture(rTex, st)) * rLevel / 100.0;
    float g = luminance(texture(gTex, st)) * gLevel / 100.0;
    float b = luminance(texture(bTex, st)) * bLevel / 100.0;

    fragColor = vec4(r, g, b, 1.0);
}
