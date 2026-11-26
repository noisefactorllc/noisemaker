#version 300 es
precision highp float;
uniform int volumeSize;
layout(location=0) out vec4 color;
layout(location=1) out vec4 geoOut;
void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    ivec3 voxel = ivec3(pixel.x, pixel.y % volumeSize, pixel.y / volumeSize);
    bool solid = all(greaterThanEqual(voxel, ivec3(4))) && all(lessThan(voxel, ivec3(12)));
    color = solid ? vec4(1.0, 0.25, 0.75, 1.0) : vec4(0.0);
    geoOut = vec4(0.5, 1.0, 0.5, solid ? 1.0 : 0.0);
}
