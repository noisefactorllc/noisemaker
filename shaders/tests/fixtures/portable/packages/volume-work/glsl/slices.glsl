#version 300 es
precision highp float;

// Show the volume's z slices side by side, each volumeSize pixels square:
// slice z is tile (z % columns, z / columns), with as many columns as fit
// across the output. A pixel past the last slice is transparent black.

uniform sampler2D volumeCache;
uniform int volumeSize;
uniform vec2 resolution;

out vec4 fragColor;

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    int columns = max(1, int(resolution.x) / volumeSize);
    ivec2 tile = pixel / volumeSize;
    int z = tile.y * columns + tile.x;
    if (tile.x >= columns || z >= volumeSize) {
        fragColor = vec4(0.0);
        return;
    }
    ivec2 inSlice = pixel - tile * volumeSize;
    fragColor = texelFetch(volumeCache, ivec2(inSlice.x, inSlice.y + z * volumeSize), 0);
}
