#version 300 es
precision highp float;
precision highp int;

uniform sampler2D orderTex;
uniform int runLength;
out vec4 fragColor;

vec2 keyAt(int index, int width) {
    return texelFetch(orderTex, ivec2(index % width, index / width), 0).rg;
}
bool before(vec2 a, vec2 b) {
    return a.x < b.x || (a.x == b.x && a.y <= b.y);
}

void main() {
    ivec2 dims = textureSize(orderTex, 0);
    ivec2 coord = ivec2(gl_FragCoord.xy);
    int index = coord.y * dims.x + coord.x;
    int count = dims.x * dims.y;
    if (runLength >= count) {
        fragColor = texelFetch(orderTex, coord, 0);
        return;
    }
    int start = (index / (2 * runLength)) * (2 * runLength);
    int lengthA = min(runLength, count - start);
    int lengthB = min(runLength, count - start - lengthA);
    int diagonal = index - start;
    int low = max(0, diagonal - lengthB);
    int high = min(diagonal, lengthA);
    // Find the partition for this output position in the two sorted runs.
    for (int step = 0; step < 22 && low < high; step++) {
        int mid = (low + high) / 2;
        int other = diagonal - mid;
        if (mid < lengthA && other > 0 && before(keyAt(start + mid, dims.x), keyAt(start + lengthA + other - 1, dims.x))) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    int other = diagonal - low;
    vec2 a = low < lengthA ? keyAt(start + low, dims.x) : vec2(3.402823466e38);
    vec2 b = other < lengthB ? keyAt(start + lengthA + other, dims.x) : vec2(3.402823466e38);
    fragColor = vec4(before(a, b) ? a : b, 0.0, 1.0);
}
