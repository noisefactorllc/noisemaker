#version 300 es

/*
 * Navier-Stokes display pass.
 * Plain bilinear blit of the intermediate smoothed canvas into the output. The smoothing kernel
 * lives in nsSmooth (between sim and display), not here — so this pass does no kernel work and
 * never operates at the compute canvas's native resolution.
 */

precision highp float;
precision highp int;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float inputIntensity;

uniform sampler2D fbTex;
uniform sampler2D inputTex;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(fbTex, 0);
    ivec2 minIdx = ivec2(0);
    ivec2 maxIdx = texSize - ivec2(1);

    vec2 texelPos = (globalCoord * vec2(texSize) / fullResolution) - vec2(0.5);
    ivec2 baseI = ivec2(floor(texelPos));
    vec2 f = fract(texelPos);

    float v00 = texelFetch(fbTex, clamp(baseI,                       minIdx, maxIdx), 0).b;
    float v10 = texelFetch(fbTex, clamp(baseI + ivec2(1, 0),         minIdx, maxIdx), 0).b;
    float v01 = texelFetch(fbTex, clamp(baseI + ivec2(0, 1),         minIdx, maxIdx), 0).b;
    float v11 = texelFetch(fbTex, clamp(baseI + ivec2(1, 1),         minIdx, maxIdx), 0).b;

    float v0 = mix(v00, v10, f.x);
    float v1 = mix(v01, v11, f.x);
    float state = mix(v0, v1, f.y);

    float intensity = clamp(state, 0.0, 1.0);
    vec3 outCol = vec3(intensity);

    float blend = clamp(inputIntensity, 0.0, 100.0) * 0.01;
    if (blend > 0.0) {
        vec2 inputUv = globalCoord / fullResolution;
        vec3 inputColor = texture(inputTex, inputUv).rgb;
        outCol = mix(outCol, inputColor, blend);
    }

    fragColor = vec4(outCol, 1.0);
}
