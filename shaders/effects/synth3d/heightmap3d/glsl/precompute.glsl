#version 300 es
precision highp float;
precision highp int;

uniform sampler2D heightTex;
uniform sampler2D tex;
uniform int volumeSize;
uniform float heightScale;
uniform float baseHeight;
uniform float aspect;
uniform float aspectInv;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 geoOut;

// The terrain keeps the frame's proportions inside the square footprint of the
// volume. On a wide frame it spans the volume's width and a part of its depth,
// on a tall frame the depth and a part of the width, and on a square frame all
// of both. Each span is a whole, even count of columns, so the terrain is
// centered. aspect and aspectInv are the frame's width over its height and the
// inverse. They are computed outside the shader and the volume size is a power
// of two, so both backends get the same counts.
ivec2 terrainSpan() {
    float halfSize = float(volumeSize) * 0.5;
    return ivec2(
        aspect < 1.0 ? max(2, 2 * int(floor(halfSize * aspect + 0.5))) : volumeSize,
        aspectInv < 1.0 ? max(2, 2 * int(floor(halfSize * aspectInv + 0.5))) : volumeSize);
}

// The place of an XZ voxel column in the terrain, counted in columns from the
// terrain's own corner. Volume z = 0 is toward the image's top row, so a view
// from above along -Y, screen right on +X, shows the image as authored rather
// than mirrored.
ivec2 terrainColumn(ivec2 column) {
    return ivec2(column.x, volumeSize - 1 - column.y) - (volumeSize - terrainSpan()) / 2;
}

bool inTerrain(ivec2 column) {
    ivec2 image = terrainColumn(column);
    return all(greaterThanEqual(image, ivec2(0))) && all(lessThan(image, terrainSpan()));
}

// Sample each image independently at the center of the XZ voxel column.
ivec2 imageTexel(ivec2 column, ivec2 size) {
    return clamp(((terrainColumn(column) * 2 + 1) * size) / (terrainSpan() * 2), ivec2(0), size - 1);
}

float columnHeight(ivec2 column) {
    if (!inTerrain(column)) return 0.0;
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
