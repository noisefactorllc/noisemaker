#version 300 es

/*
 * Chromatic aberration effect.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float aberrationAmt;
uniform float passthru;
out vec4 fragColor;

#define PI 3.14159265359
#define aspectRatio fullResolution.x / fullResolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 globalUV = globalCoord / fullResolution;

    vec2 diff = vec2(0.5 * aspectRatio, 0.5) - vec2(globalUV.x * aspectRatio, globalUV.y);
    float centerDist = length(diff);

    float aberrationOffset = map(aberrationAmt, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

    float redOffset = mix(clamp(uv.x + aberrationOffset, 0.0, 1.0), uv.x, uv.x);
    vec4 red = texture(inputTex, vec2(redOffset, uv.y));

    vec4 green = texture(inputTex, uv);

    float blueOffset = mix(uv.x, clamp(uv.x - aberrationOffset, 0.0, 1.0), uv.x);
    vec4 blue = texture(inputTex, vec2(blueOffset, uv.y));

    // chromatic aberration - extract color fringing edges only
    vec3 aberrated = vec3(red.r, green.g, blue.b);
    vec3 edges = aberrated - green.rgb;

    // scale original by passthru and add to edges
    vec3 original = green.rgb * map(passthru, 0.0, 100.0, 0.0, 2.0);

    fragColor = vec4(min(edges + original, 1.0), green.a);
}
