/*
 * Cubemap cloud shell renderer (GLSL) — renderCubemapCloudShell
 *
 * Samples an upstream 3D volume inside a spherical atmospheric band and emits a
 * straight-alpha cloud cubemap for compositing over terrain/ocean layers.
 */

#version 300 es
precision highp float;

#ifndef QUALITY
#define QUALITY 1
#endif

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int volumeSize;
uniform mat3 cubeBasis;
uniform sampler2D volumeCache;
uniform float innerRadius;
uniform float outerRadius;
uniform float coverage;
uniform float softness;
uniform float density;
uniform float absorption;
uniform vec3 cloudColor;
uniform vec3 shadowColor;
uniform vec3 lightDirection;
uniform float silverLining;
uniform vec3 bgColor;
uniform float bgAlpha;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

ivec2 atlasTexel(ivec3 p, int volSize) {
    return ivec2(p.x, p.y + p.z * volSize);
}

int shellSteps() {
    if (QUALITY == 0) return 32;
    if (QUALITY == 2) return 96;
    return 64;
}

vec4 sampleVolume(vec3 worldPos) {
    int volSize = volumeSize;
    float volSizeF = float(volSize);
    vec3 uvw = clamp(worldPos * 0.5 + 0.5, 0.0, 1.0);
    vec3 texelPos = uvw * (volSizeF - 1.0);
    vec3 texelFloor = floor(texelPos);
    vec3 frac = texelPos - texelFloor;

    ivec3 i0 = ivec3(texelFloor);
    ivec3 i1 = min(i0 + 1, volSize - 1);

    vec4 c000 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i0.y, i0.z), volSize), 0);
    vec4 c100 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i0.y, i0.z), volSize), 0);
    vec4 c010 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i1.y, i0.z), volSize), 0);
    vec4 c110 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i1.y, i0.z), volSize), 0);
    vec4 c001 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i0.y, i1.z), volSize), 0);
    vec4 c101 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i0.y, i1.z), volSize), 0);
    vec4 c011 = texelFetch(volumeCache, atlasTexel(ivec3(i0.x, i1.y, i1.z), volSize), 0);
    vec4 c111 = texelFetch(volumeCache, atlasTexel(ivec3(i1.x, i1.y, i1.z), volSize), 0);

    vec4 c00 = mix(c000, c100, frac.x);
    vec4 c10 = mix(c010, c110, frac.x);
    vec4 c01 = mix(c001, c101, frac.x);
    vec4 c11 = mix(c011, c111, frac.x);
    vec4 c0 = mix(c00, c10, frac.y);
    vec4 c1 = mix(c01, c11, frac.y);
    return mix(c0, c1, frac.z);
}

float cloudField(vec4 s) {
    return clamp(max(s.r, max(s.g, s.b)), 0.0, 1.0);
}

void main() {
    vec2 res = (fullResolution.x > 0.0) ? fullResolution : resolution;
    vec2 uv = ((gl_FragCoord.xy + tileOffset) - 0.5 * res) / (0.5 * res.y);
    vec3 rd = normalize(cubeBasis * vec3(uv.x, -uv.y, 1.0));
    vec3 normal = normalize(rd);
    vec3 lightDir = normalize(lightDirection);

    float inner = max(0.001, min(innerRadius, outerRadius));
    float outer = max(inner + 0.001, max(innerRadius, outerRadius));
    float thickness = outer - inner;
    float c0 = clamp(coverage, 0.0, 0.999);
    float c1 = min(1.0, c0 + max(softness, 0.001));
    int steps = shellSteps();

    vec3 premul = vec3(0.0);
    float outAlpha = 0.0;
    float trans = 1.0;
    float dt = thickness / float(steps);
    float t = inner + dt * 0.5;

    for (int i = 0; i < 96; i++) {
        if (i >= steps) break;
        float layer = clamp((t - inner) / thickness, 0.0, 1.0);
        float radial = smoothstep(0.0, 0.22, layer) * (1.0 - smoothstep(0.78, 1.0, layer));
        vec4 s = sampleVolume((rd * t) / outer);
        float field = cloudField(s);
        float mass = smoothstep(c0, c1, field) * radial;
        float a = 1.0 - exp(-mass * density * max(absorption, 0.001) / float(steps));

        float diffuse = 0.35 + 0.65 * max(dot(normal, lightDir), 0.0);
        float rim = pow(max(1.0 - abs(dot(normal, lightDir)), 0.0), 3.0) * silverLining;
        vec3 lit = mix(shadowColor, cloudColor, diffuse) + cloudColor * rim;
        lit *= mix(0.8, 1.15, field);

        premul += trans * a * lit;
        outAlpha += trans * a;
        trans *= (1.0 - a);
        if (trans < 0.01) break;
        t += dt;
    }

    float finalAlpha = outAlpha + trans * bgAlpha;
    vec3 finalPremul = premul + trans * bgAlpha * bgColor;
    vec3 finalColor = finalAlpha > 0.0001 ? finalPremul / finalAlpha : bgColor;

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), clamp(finalAlpha, 0.0, 1.0));
    geoOut = vec4(normal * 0.5 + 0.5, outAlpha);
}
