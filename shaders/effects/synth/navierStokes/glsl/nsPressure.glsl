#version 300 es

/*
 * Navier-Stokes pressure pass (Jacobi iteration).
 * One step of the Jacobi solver for ∇²p = ∇·u. Pressure is in R, divergence in G (preserved
 * across iterations). The runtime ping-pongs the state texture for each repeated invocation.
 */

precision highp float;
precision highp int;

uniform vec2 resolution;

uniform sampler2D bufTex;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(bufTex, 0);
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 texel = 1.0 / vec2(texSize);
    vec2 uv = fragCoord / vec2(texSize);

    float pR = texture(bufTex, uv + vec2(texel.x, 0.0)).r;
    float pL = texture(bufTex, uv - vec2(texel.x, 0.0)).r;
    float pT = texture(bufTex, uv + vec2(0.0, texel.y)).r;
    float pB = texture(bufTex, uv - vec2(0.0, texel.y)).r;

    float div = texture(bufTex, uv).g;

    float p = (pR + pL + pT + pB - div) * 0.25;

    fragColor = vec4(p, div, 0.0, 1.0);
}
