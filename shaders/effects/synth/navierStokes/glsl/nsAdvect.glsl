#version 300 es

/*
 * Navier-Stokes advection pass (semi-Lagrangian).
 * Canonical bilinear backtrace sample — fixed kernel so each frame's advection doesn't compound
 * extra blur into the compute texture. The smoothing dropdown is a display-side read of the
 * canvas, not a sim-side filter.
 */

precision highp float;
precision highp int;

uniform vec2 resolution;
uniform float speed;
uniform float dyeDecay;
uniform float velocityDecay;

uniform sampler2D bufTex;

out vec4 fragColor;

vec4 fetchTex(ivec2 idx, ivec2 minIdx, ivec2 maxIdx) {
    return texelFetch(bufTex, clamp(idx, minIdx, maxIdx), 0);
}

vec4 sampleBilinear(vec2 uv, ivec2 texSize) {
    ivec2 minIdx = ivec2(0);
    ivec2 maxIdx = texSize - ivec2(1);
    vec2 texelPos = uv * vec2(texSize) - vec2(0.5);
    ivec2 baseI = ivec2(floor(texelPos));
    vec2 f = fract(texelPos);

    vec4 v00 = fetchTex(baseI,                       minIdx, maxIdx);
    vec4 v10 = fetchTex(baseI + ivec2(1, 0),         minIdx, maxIdx);
    vec4 v01 = fetchTex(baseI + ivec2(0, 1),         minIdx, maxIdx);
    vec4 v11 = fetchTex(baseI + ivec2(1, 1),         minIdx, maxIdx);
    vec4 v0 = mix(v00, v10, f.x);
    vec4 v1 = mix(v01, v11, f.x);
    return mix(v0, v1, f.y);
}

void main() {
    ivec2 texSize = textureSize(bufTex, 0);
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / vec2(texSize);

    vec4 here = texelFetch(bufTex, clamp(ivec2(fragCoord), ivec2(0), texSize - ivec2(1)), 0);
    vec2 u = here.rg;

    float dt = clamp(speed, 0.0, 200.0) * 0.0001;
    vec2 backUv = clamp(uv - u * dt, vec2(0.0), vec2(1.0));

    vec4 advected = sampleBilinear(backUv, texSize);
    vec2 newVel = advected.rg;
    float newDye = advected.b;

    float vDecay = pow(clamp(velocityDecay, 0.0, 100.0) * 0.01, dt * 60.0);
    float dDecay = pow(clamp(dyeDecay, 0.0, 100.0) * 0.01, dt * 60.0);

    newVel *= vDecay;
    newDye *= dDecay;

    fragColor = vec4(newVel, newDye, 1.0);
}
