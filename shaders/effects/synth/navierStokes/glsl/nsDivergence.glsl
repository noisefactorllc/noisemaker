#version 300 es

/*
 * Navier-Stokes divergence pass.
 * Centered finite difference of velocity into the G channel of pressure state, zeroing R so the
 * subsequent Jacobi iterations start from p = 0 each frame.
 */

precision highp float;
precision highp int;

uniform vec2 resolution;

uniform sampler2D velTex;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(velTex, 0);
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 texel = 1.0 / vec2(texSize);
    vec2 uv = fragCoord / vec2(texSize);

    vec2 uR = texture(velTex, uv + vec2(texel.x, 0.0)).rg;
    vec2 uL = texture(velTex, uv - vec2(texel.x, 0.0)).rg;
    vec2 uT = texture(velTex, uv + vec2(0.0, texel.y)).rg;
    vec2 uB = texture(velTex, uv - vec2(0.0, texel.y)).rg;

    // Free-slip at boundaries: mirror normal component so velocity can't drive flow through walls.
    if (fragCoord.x < 1.0) { uL.x = -uR.x; }
    if (fragCoord.x > float(texSize.x) - 1.0) { uR.x = -uL.x; }
    if (fragCoord.y < 1.0) { uB.y = -uT.y; }
    if (fragCoord.y > float(texSize.y) - 1.0) { uT.y = -uB.y; }

    float div = 0.5 * ((uR.x - uL.x) + (uT.y - uB.y));

    fragColor = vec4(0.0, div, 0.0, 1.0);
}
