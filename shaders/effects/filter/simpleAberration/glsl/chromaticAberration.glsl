#version 300 es

/*
 * Chromatic aberration effect.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float displacement;
out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    uv.y = 1.0 - uv.y;

    float redOffset = clamp(uv.x + displacement, 0.0, 1.0);
    vec4 red = texture(inputTex, vec2(redOffset, uv.y));

    vec4 green = texture(inputTex, uv);

    float blueOffset = clamp(uv.x - displacement, 0.0, 1.0);
    vec4 blue = texture(inputTex, vec2(blueOffset, uv.y));

    // chromatic aberration
    fragColor = vec4(red.r, green.g, blue.b, green.a);
}
