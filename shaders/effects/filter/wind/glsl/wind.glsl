/*
 * Wind — soft horizontal trails from bright image structure.
 *
 * Every fragment integrates brighter samples along its upwind scanline.
 * A smooth luminance gate prevents threshold chatter, distance weights
 * taper the run, and the weighted integration avoids the hard winner and
 * random segment boundaries that make a directional trail look like grain.
 * Wind tapers quickly, Blast carries a broad dense trail, and Stagger uses
 * a continuous row phase so adjacent scanlines separate without band edges.
 */

#ifdef GL_ES
precision highp float;
#endif

// METHOD is a compile-time define injected by the runtime (see definition.js
// `globals.method.define`). Wrapping the wind/blast/stagger dispatch in #if
// blocks instead of a runtime int comparison lets the compiler drop the
// unreachable decay/taper/density/gain arms for the compiled variant.
#ifndef METHOD
#define METHOD 1
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform int direction;
uniform float strength;
uniform float threshold;

out vec4 fragColor;

const int MAX_STEPS = 128;
const float STEP_PX = 1.0;
const float MAX_REACH = 128.0;

float lum(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec4 src = texture(inputTex, uv);

    float amount = clamp(strength / 100.0, 0.0, 1.0);
    if (amount <= 0.0) {
        fragColor = src;
        return;
    }

    float reach = MAX_REACH * amount;
    float marchDir = (direction == 0) ? -1.0 : 1.0;
    float staggerPhase = 0.0;
#if METHOD == 2
    // Slow, continuous scanline phase: recognizably staggered without
    // discontinuous four-pixel bands or a per-row random field.
    staggerPhase = (0.5 + 0.5 * sin(globalCoord.y * 0.22))
        * min(12.0, reach * 0.18);
#endif

    vec3 accumColor = vec3(0.0);
    float accumWeight = 0.0;
    float baseLum = lum(src.rgb);
    float edge = threshold / 100.0;

    for (int i = 1; i <= MAX_STEPS; i++) {
        float distancePx = float(i) * STEP_PX;
        if (distancePx > reach) { break; }

        float sampleDistance = distancePx + staggerPhase;
        vec2 sampleUV = clamp(
            (gl_FragCoord.xy + vec2(marchDir * sampleDistance, 0.0)) / resolution,
            0.0, 1.0);
        vec3 candidate = texture(inputTex, sampleUV).rgb;

        float contrast = lum(candidate) - baseLum - edge;
        float activation = smoothstep(0.0, 0.08, contrast);
        float alongRun = distancePx / max(reach, 1.0);
#if METHOD == 1
        float decayRate = 0.8;
#elif METHOD == 2
        float decayRate = 2.0;
#else
        float decayRate = 3.4;
#endif
#if METHOD == 1
        float taperStart = 0.82;
#else
        float taperStart = 0.72;
#endif
        float endTaper = 1.0 - smoothstep(taperStart, 1.0, alongRun);
        float weight = activation * exp(-decayRate * alongRun) * endTaper;
        accumColor += candidate * weight;
        accumWeight += weight;
    }

    vec3 integrated = accumColor / max(accumWeight, 0.00001);
#if METHOD == 1
    float densityRate = 0.12;
#else
    float densityRate = 0.16;
#endif
    float density = 1.0 - exp(-accumWeight * densityRate);
#if METHOD == 1
    float methodGain = 1.0;
#else
    float methodGain = 0.88;
#endif
    float blendAmount = clamp(density * amount * methodGain, 0.0, 1.0);
    vec3 streak = mix(src.rgb, integrated, blendAmount);

    fragColor = vec4(max(src.rgb, streak), src.a);
}
