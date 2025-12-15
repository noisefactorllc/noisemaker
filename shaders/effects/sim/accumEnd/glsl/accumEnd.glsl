/**
 * accumEnd - Pass through input to output
 *
 * Simple passthrough shader for the accumEnd effect.
 * The actual feedback write happens in the copy pass.
 */
#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    fragColor = texture(inputTex, st);
}
