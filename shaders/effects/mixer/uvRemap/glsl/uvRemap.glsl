#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int mapSource;
uniform int channel;
uniform float scale;
uniform float offset;
uniform int wrap;

out vec4 fragColor;

float mirrorWrap(float t) {
    float m = mod(t, 2.0);
    return m > 1.0 ? 2.0 - m : m;
}

vec2 applyWrap(vec2 uv, int wrapMode) {
    if (wrapMode == 0) {
        return clamp(uv, 0.0, 1.0);
    } else if (wrapMode == 1) {
        return vec2(mirrorWrap(uv.x), mirrorWrap(uv.y));
    } else {
        return fract(uv);
    }
}

void main() {
    vec2 localUV = gl_FragCoord.xy / resolution;
    vec4 colorA = texture(inputTex, localUV);
    vec4 colorB = texture(tex, localUV);

    vec4 mapColor = (mapSource == 0) ? colorA : colorB;
    int sampleFromB = (mapSource == 0) ? 1 : 0;

    vec2 rawUV;
    if (channel == 0) {
        rawUV = mapColor.rg;
    } else if (channel == 1) {
        rawUV = vec2(mapColor.r, mapColor.b);
    } else {
        rawUV = vec2(mapColor.g, mapColor.b);
    }

    float s = scale / 100.0;
    vec2 remappedUV = rawUV * s + offset;
    remappedUV = applyWrap(remappedUV, wrap);

    vec2 sampleUV = (remappedUV * fullResolution - tileOffset) / resolution;
    sampleUV = fract(sampleUV);

    vec4 result;
    if (sampleFromB == 1) {
        result = texture(tex, sampleUV);
    } else {
        result = texture(inputTex, sampleUV);
    }

    fragColor = result;
}