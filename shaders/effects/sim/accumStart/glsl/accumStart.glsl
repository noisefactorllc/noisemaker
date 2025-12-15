/**
 * accumStart - Blend input with accumulator buffer using lighten mode
 *
 * Reads from the shared accumulator texture (feedback from previous frame)
 * and blends with the current input using max (lighten) blend mode.
 * The result passes through to the next effect in the chain.
 */
#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D accumTex;
uniform vec2 resolution;
uniform float alpha;
uniform float intensity;

out vec4 fragColor;

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 inputColor = texture(inputTex, st);
    vec4 accum = texture(accumTex, st);

    // Normalize alpha from 0-100 to 0-1
    float a = alpha / 100.0;

    // Normalize intensity from 0-100 to 0-1
    float i = intensity / 100.0;

    // Lighten blend: max of input and accumulated
    vec4 blended = max(inputColor, accum * i);

    // Mix between pure input and blended based on alpha
    vec4 result = mix(inputColor, blended, a);

    // Preserve alpha
    result.a = max(inputColor.a, accum.a);

    fragColor = result;
}
