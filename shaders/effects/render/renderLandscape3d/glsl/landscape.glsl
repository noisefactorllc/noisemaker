#version 300 es
precision highp float;
precision highp int;

uniform sampler2D volumeCache;
uniform sampler2D analyticalGeo;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int volumeSize;
uniform float threshold;
uniform int densitySource;
uniform float zoom;
uniform float panX;
uniform float panY;
uniform vec3 lightDirection;
uniform float ambient;
uniform float diffuseIntensity;
uniform float specularIntensity;
uniform vec3 bgColor;
uniform float bgAlpha;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

vec3 lighting(vec3 color, vec3 normal) {
    vec3 light = vec3(0.0, 1.0, 0.0);
    if (dot(lightDirection, lightDirection) > 0.000001) light = normalize(lightDirection);
    vec3 halfVector = light + vec3(0.5773502692);
    float specular = 0.0;
    if (dot(halfVector, halfVector) > 0.000001) {
        specular = pow(max(dot(normal, normalize(halfVector)), 0.0), 32.0) * specularIntensity;
    }
    return color * (ambient + max(dot(normal, light), 0.0) * diffuseIntensity) + specular;
}

void main() {
    fragColor = vec4(bgColor, bgAlpha);
    geoOut = vec4(0.5, 0.5, 1.0, 1.0);
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : resolution;
    vec2 uv = (gl_FragCoord.xy + tileOffset - fullRes * 0.5) / fullRes.y;
    float size = float(volumeSize);
    float aspect = fullRes.x / fullRes.y;
    // Fit the projected cube in either viewport orientation, with a small margin.
    float span = max(1.6329931619, 1.4142135624 / aspect) * size * 1.08 / max(zoom, 0.001);
    vec3 right = vec3(0.7071067812, 0.0, -0.7071067812);
    vec3 up = vec3(-0.4082482905, 0.8164965809, -0.4082482905);
    vec3 origin = vec3(size * 2.5) + right * (uv.x + panX) * span + up * (uv.y + panY) * span;

    // The fixed isometric ray is (-1,-1,-1). Keeping it unnormalized gives unit DDA steps.
    vec3 nearT = origin - size;
    float enter = max(max(nearT.x, nearT.y), nearT.z);
    float leave = min(min(origin.x, origin.y), origin.z);
    if (enter >= leave) return;
    float distance = max(enter, 0.0);
    ivec3 cell = clamp(ivec3(floor(origin - (distance + 0.0001))), ivec3(0), ivec3(volumeSize - 1));
    vec3 nextT = origin - vec3(cell);
    vec3 normal = vec3(0.0, 0.0, 1.0);
    if (nearT.y >= nearT.x && nearT.y >= nearT.z) normal = vec3(0.0, 1.0, 0.0);
    else if (nearT.x >= nearT.z) normal = vec3(1.0, 0.0, 0.0);

    // A ray crosses at most 3*N cells, including tied boundaries.
    for (int step = 0; step < volumeSize * 3; step++) {
        if (any(lessThan(cell, ivec3(0))) || distance >= leave) break;
        ivec2 atlas = ivec2(cell.x, cell.y + cell.z * volumeSize);
        // Scalar-field generators can use red; colored volumes use geometry alpha.
        float density = densitySource == 1 ? texelFetch(volumeCache, atlas, 0).r : texelFetch(analyticalGeo, atlas, 0).a;
        if (density > 0.0 && density >= threshold) {
            vec3 color = texelFetch(volumeCache, atlas, 0).rgb;
            fragColor = vec4(lighting(color, normal), 1.0);
            geoOut = vec4(normal * 0.5 + 0.5, clamp(distance / (size * 4.0), 0.0, 1.0));
            return;
        }
        distance = min(min(nextT.x, nextT.y), nextT.z);
        // Advance every tied axis so edge-only contacts cannot create stray voxels.
        bvec3 crossed = lessThanEqual(nextT, vec3(distance));
        if (crossed.y) normal = vec3(0.0, 1.0, 0.0);
        else if (crossed.x) normal = vec3(1.0, 0.0, 0.0);
        else normal = vec3(0.0, 0.0, 1.0);
        cell -= ivec3(crossed);
        nextT += vec3(crossed);
    }
}
