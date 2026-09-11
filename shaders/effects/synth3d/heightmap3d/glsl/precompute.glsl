#version 300 es
precision highp float;
precision highp int;

uniform sampler2D heightTex;
uniform sampler2D tex;
uniform int volumeSize;
uniform float heightScale;
uniform float baseHeight;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

// Sample each image independently at the center of the XZ voxel column.
ivec2 imageTexel(ivec2 column, ivec2 size) {
    return clamp(((column * 2 + 1) * size) / (volumeSize * 2), ivec2(0), size - 1);
}

float columnHeight(ivec2 column) {
    vec3 rgb = texelFetch(heightTex, imageTexel(column, textureSize(heightTex, 0)), 0).rgb;
    float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    return floor(clamp(luminance * heightScale + baseHeight, 0.0, 1.0) * float(volumeSize) + 0.5);
}

float density(ivec3 p) {
    if (any(lessThan(p, ivec3(0))) || any(greaterThanEqual(p, ivec3(volumeSize)))) return 0.0;
    return float(float(p.y) < columnHeight(p.xz));
}

void main() {
    ivec2 atlas = ivec2(gl_FragCoord.xy);
    ivec3 p = ivec3(atlas.x, atlas.y % volumeSize, atlas.y / volumeSize);
    float occupied = density(p);
    fragColor = vec4(0.0);
    geoOut = vec4(0.5, 1.0, 0.5, 0.0);
    if (occupied == 0.0) return;

    vec3 color = texelFetch(tex, imageTexel(p.xz, textureSize(tex, 0)), 0).rgb;
    // Occupancy goes in both alpha channels; diffuse brightness never changes the shape.
    fragColor = vec4(color, occupied);
    vec3 normal = vec3(
        density(p - ivec3(1, 0, 0)) - density(p + ivec3(1, 0, 0)),
        density(p - ivec3(0, 1, 0)) - density(p + ivec3(0, 1, 0)),
        density(p - ivec3(0, 0, 1)) - density(p + ivec3(0, 0, 1))
    );
    normal = dot(normal, normal) > 0.0 ? normalize(normal) : vec3(0.0, 1.0, 0.0);
    geoOut = vec4(normal * 0.5 + 0.5, occupied);
}
