#version 300 es
precision highp float;

// Fill a volumeSize^3 volume, stored as a volumeSize x volumeSize^2 atlas:
// texel (x, y + z * volumeSize) is voxel (x, y, z), the catalog's layout.
// Voxel (x, y, z) holds (x, y, z) / (volumeSize - 1).

uniform int volumeSize;

out vec4 fragColor;

void main() {
    ivec2 texel = ivec2(gl_FragCoord.xy);
    ivec3 voxel = ivec3(texel.x, texel.y % volumeSize, texel.y / volumeSize);
    fragColor = vec4(vec3(voxel) / float(volumeSize - 1), 1.0);
}
