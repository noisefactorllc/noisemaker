/*
 * Exact dense whole-color Median / Dust & Scratches.
 *
 * RADIUS is a compile-time definition. The 3x3, 5x5, and 7x7 variants make
 * exactly 9, 25, and 49 clamped integer texture reads. A bounded in-place
 * selection partitions packed RGB/luminance records around the middle rank,
 * avoiding the work and register pressure of fully sorting the neighborhood.
 */

#ifdef GL_ES
precision highp float;
#endif

#if RADIUS == 1
#define REAL_COUNT 9
#elif RADIUS == 2
#define REAL_COUNT 25
#else
#define REAL_COUNT 49
#endif

uniform sampler2D inputTex;
uniform float threshold;

out vec4 fragColor;

bool lessRecord(uvec2 a, uint blueA, uvec2 b, uint blueB) {
    if (a.x != b.x) return a.x < b.x;
    if (a.y != b.y) return a.y < b.y;
    return blueA < blueB;
}

uvec2 packRecordMajor(vec4 sampleColor) {
    float brightness = dot(sampleColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    uint packedRg = packHalf2x16(sampleColor.rg);
    uint orderedRg = ((packedRg & 0xffffu) << 16) | (packedRg >> 16);
    return uvec2(floatBitsToUint(brightness), orderedRg);
}

uint packRecordBlue(vec4 sampleColor) {
    return packHalf2x16(vec2(sampleColor.b, 0.0)) & 0xffffu;
}

vec3 unpackRecordRgb(uvec2 major, uint blue) {
    uint packedRg = (major.y << 16) | (major.y >> 16);
    vec2 rg = unpackHalf2x16(packedRg);
    float b = unpackHalf2x16(blue).x;
    return vec3(rg, b);
}

vec4 readRecord(ivec2 center, ivec2 dimensions, int x, int y) {
    ivec2 coord = clamp(center + ivec2(x, y), ivec2(0), dimensions - ivec2(1));
    return texelFetch(inputTex, coord, 0);
}

void main() {
    uvec2 majorRecords[REAL_COUNT];
    uint blueRecords[REAL_COUNT];
    ivec2 dimensions = textureSize(inputTex, 0);
    ivec2 center = ivec2(gl_FragCoord.xy);
    vec3 originalRgb = vec3(0.0);
    float centerAlpha = 1.0;
    int index = 0;
    for (int y = -RADIUS; y <= RADIUS; y++) {
        for (int x = -RADIUS; x <= RADIUS; x++) {
            vec4 sampleColor = readRecord(center, dimensions, x, y);
            majorRecords[index] = packRecordMajor(sampleColor);
            blueRecords[index] = packRecordBlue(sampleColor);
            if (x == 0 && y == 0) {
                originalRgb = sampleColor.rgb;
                centerAlpha = sampleColor.a;
            }
            index++;
        }
    }

    int medianIndex = REAL_COUNT / 2;
    int left = 0;
    int right = REAL_COUNT - 1;
    while (left < right) {
        uvec2 pivotMajor = majorRecords[medianIndex];
        uint pivotBlue = blueRecords[medianIndex];
        int scanLeft = left;
        int scanRight = right;
        while (scanLeft <= scanRight) {
            while (lessRecord(majorRecords[scanLeft], blueRecords[scanLeft], pivotMajor, pivotBlue)) { scanLeft++; }
            while (lessRecord(pivotMajor, pivotBlue, majorRecords[scanRight], blueRecords[scanRight])) { scanRight--; }
            if (scanLeft <= scanRight) {
                uvec2 temporaryMajor = majorRecords[scanLeft];
                majorRecords[scanLeft] = majorRecords[scanRight];
                majorRecords[scanRight] = temporaryMajor;
                uint temporaryBlue = blueRecords[scanLeft];
                blueRecords[scanLeft] = blueRecords[scanRight];
                blueRecords[scanRight] = temporaryBlue;
                scanLeft++;
                scanRight--;
            }
        }
        if (scanRight < medianIndex) { left = scanLeft; }
        if (medianIndex < scanLeft) { right = scanRight; }
    }

    vec3 medianRgb = unpackRecordRgb(majorRecords[medianIndex], blueRecords[medianIndex]);
    vec3 difference = abs(originalRgb - medianRgb);
    float maxDifference = max(max(difference.r, difference.g), difference.b);
    bool replaceCenter = threshold <= 0.0 || maxDifference >= threshold / 100.0;
    fragColor = vec4(replaceCenter ? medianRgb : originalRgb, centerAlpha);
}
