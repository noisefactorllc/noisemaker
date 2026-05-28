#version 300 es

/*
 * Navier-Stokes gradient subtraction (projection) pass.
 * Subtracts ∇p from the velocity field so the result is divergence-free (Helmholtz-Hodge).
 * Velocity is stored unencoded in R,G; dye in B is passed through untouched.
 */

precision highp float;
precision highp int;

uniform vec2 resolution;

uniform sampler2D velTex;
uniform sampler2D pressureTex;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(velTex, 0);
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 texel = 1.0 / vec2(texSize);
    vec2 uv = fragCoord / vec2(texSize);

    float pR = texture(pressureTex, uv + vec2(texel.x, 0.0)).r;
    float pL = texture(pressureTex, uv - vec2(texel.x, 0.0)).r;
    float pT = texture(pressureTex, uv + vec2(0.0, texel.y)).r;
    float pB = texture(pressureTex, uv - vec2(0.0, texel.y)).r;

    vec2 grad = 0.5 * vec2(pR - pL, pT - pB);

    vec4 here = texture(velTex, uv);
    vec2 u = here.rg - grad;

    fragColor = vec4(u, here.b, 1.0);
}
