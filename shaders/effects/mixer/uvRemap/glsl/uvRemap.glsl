#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform int mapSource;
uniform int channel;
uniform float scale;
uniform float offset;
uniform int wrap;

out vec4 fragColor;

// Mirror wrap: ping-pong between 0 and 1
float mirrorWrap(float t) {
    float m = mod(t, 2.0);
    return m > 1.0 ? 2.0 - m : m;
}

vec2 applyWrap(vec2 uv, int wrapMode) {
    if (wrapMode == 0) {
        // Clamp
        return clamp(uv, 0.0, 1.0);
    } else if (wrapMode == 1) {
        // Mirror
        return vec2(mirrorWrap(uv.x), mirrorWrap(uv.y));
    } else {
        // Repeat
        return fract(uv);
    }
}

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 colorA = texture(inputTex, st);
    vec4 colorB = texture(tex, st);

    // Choose map and sample sources
    vec4 mapColor = (mapSource == 0) ? colorA : colorB;
    int sampleFromB = (mapSource == 0) ? 1 : 0;

    // Extract UV channels
    vec2 rawUV;
    if (channel == 0) {
        rawUV = mapColor.rg;
    } else if (channel == 1) {
        rawUV = vec2(mapColor.r, mapColor.b);
    } else {
        rawUV = vec2(mapColor.g, mapColor.b);
    }

    // Apply scale (percentage: 100 = identity) and offset
    float s = scale / 100.0;
    vec2 remappedUV = rawUV * s + offset;

    // Apply wrap mode
    remappedUV = applyWrap(remappedUV, wrap);

    // Sample the other texture at remapped UVs
    vec4 result;
    if (sampleFromB == 1) {
        result = texture(tex, remappedUV);
    } else {
        result = texture(inputTex, remappedUV);
    }

    fragColor = result;
}
