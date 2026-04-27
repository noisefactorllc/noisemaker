/*
 * Glyph Map effect
 * Converts image to ASCII/glyph art using hardcoded 5x7 glyph bitmaps
 * ordered by density. Each cell maps input brightness to a glyph.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float renderScale;
uniform int cellSize;
uniform int seed;
uniform int colorMode;

out vec4 fragColor;

// PCG PRNG
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

// Hash for glyph variant selection per cell
float hash(vec2 p) {
    uvec3 v = pcg(uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        0u
    ));
    return float(v.x) / float(0xffffffffu);
}

// 16 glyphs encoded as 5x7 bitmaps (35 bits packed into int array)
// Ordered from empty (lowest density) to full (highest density)
// Each glyph: 7 rows of 5 bits, row 0 is top. Bit 4 is leftmost.
// Encoding: row[i] = 5-bit value, glyph = row0..row6

// Glyph 0: space (density ~0.00)
//  .....
//  .....
//  .....
//  .....
//  .....
//  .....
//  .....

// Glyph 1: period (density ~0.06)
//  .....
//  .....
//  .....
//  .....
//  .....
//  ..#..
//  .....

// Glyph 2: colon (density ~0.11)
//  .....
//  ..#..
//  .....
//  .....
//  .....
//  ..#..
//  .....

// Glyph 3: dash - (density ~0.14)
//  .....
//  .....
//  .....
//  .###.
//  .....
//  .....
//  .....

// Glyph 4: + (density ~0.20)
//  .....
//  ..#..
//  ..#..
//  .###.
//  ..#..
//  ..#..
//  .....

// Glyph 5: = (density ~0.17)
//  .....
//  .....
//  .###.
//  .....
//  .###.
//  .....
//  .....

// Glyph 6: * (density ~0.26)
//  .....
//  .#.#.
//  ..#..
//  .###.
//  ..#..
//  .#.#.
//  .....

// Glyph 7: o (density ~0.34)
//  .....
//  .....
//  .###.
//  .#.#.
//  .#.#.
//  .###.
//  .....

// Glyph 8: X (density ~0.34)
//  .....
//  .#.#.
//  .#.#.
//  ..#..
//  .#.#.
//  .#.#.
//  .....

// Glyph 9: # (density ~0.46)
//  .....
//  .#.#.
//  #####
//  .#.#.
//  #####
//  .#.#.
//  .....

// Glyph 10: % (density ~0.37)
//  ##..#
//  ##.#.
//  ..#..
//  .#..#
//  .#.##
//  #..##
//  .....

// Glyph 11: A (density ~0.40)
//  ..#..
//  .#.#.
//  #...#
//  #####
//  #...#
//  #...#
//  .....

// Glyph 12: W (density ~0.46)
//  #...#
//  #...#
//  #.#.#
//  #.#.#
//  ##.##
//  .#.#.
//  .....

// Glyph 13: M (density ~0.46)
//  #...#
//  ##.##
//  #.#.#
//  #.#.#
//  #...#
//  #...#
//  .....

// Glyph 14: @ (density ~0.63)
//  .###.
//  #...#
//  #.###
//  #.#.#
//  #.##.
//  #....
//  .###.

// Glyph 15: full block (density 1.00)
//  #####
//  #####
//  #####
//  #####
//  #####
//  #####
//  #####

const int GLYPH_COUNT = 16;

// Return 1.0 if pixel (x, y) is set in glyph g, else 0.0
// x: 0-4 (left to right), y: 0-6 (top to bottom)
float glyphPixel(int g, int x, int y) {
    // Encode each glyph as 7 row values (5 bits each)
    // Bit layout per row: bit4=col0(left), bit0=col4(right)

    int row = 0;

    if (g == 0) {
        // space - all zero
        return 0.0;
    } else if (g == 1) {
        // period
        if (y == 5) row = 4; // ..#..
        else return 0.0;
    } else if (g == 2) {
        // colon
        if (y == 1 || y == 5) row = 4; // ..#..
        else return 0.0;
    } else if (g == 3) {
        // dash
        if (y == 3) row = 14; // .###.
        else return 0.0;
    } else if (g == 4) {
        // plus
        if (y == 1 || y == 2 || y == 4 || y == 5) row = 4; // ..#..
        else if (y == 3) row = 14; // .###.
        else return 0.0;
    } else if (g == 5) {
        // equals
        if (y == 2 || y == 4) row = 14; // .###.
        else return 0.0;
    } else if (g == 6) {
        // asterisk
        if (y == 1 || y == 5) row = 10; // .#.#.
        else if (y == 2 || y == 4) row = 4; // ..#..
        else if (y == 3) row = 14; // .###.
        else return 0.0;
    } else if (g == 7) {
        // o
        if (y == 2 || y == 5) row = 14; // .###.
        else if (y == 3 || y == 4) row = 10; // .#.#.
        else return 0.0;
    } else if (g == 8) {
        // X
        if (y == 1 || y == 2 || y == 4 || y == 5) row = 10; // .#.#.
        else if (y == 3) row = 4; // ..#..
        else return 0.0;
    } else if (g == 9) {
        // hash #
        if (y == 1 || y == 3 || y == 5) row = 10; // .#.#.
        else if (y == 2 || y == 4) row = 31; // #####
        else return 0.0;
    } else if (g == 10) {
        // percent %
        if (y == 0) row = 25; // ##..#
        else if (y == 1) row = 26; // ##.#.
        else if (y == 2) row = 4;  // ..#..
        else if (y == 3) row = 9;  // .#..#
        else if (y == 4) row = 11; // .#.##
        else if (y == 5) row = 19; // #..##
        else return 0.0;
    } else if (g == 11) {
        // A
        if (y == 0) row = 4;  // ..#..
        else if (y == 1) row = 10; // .#.#.
        else if (y == 2) row = 17; // #...#
        else if (y == 3) row = 31; // #####
        else if (y == 4 || y == 5) row = 17; // #...#
        else return 0.0;
    } else if (g == 12) {
        // W
        if (y == 0 || y == 1) row = 17; // #...#
        else if (y == 2 || y == 3) row = 21; // #.#.#
        else if (y == 4) row = 27; // ##.##
        else if (y == 5) row = 10; // .#.#.
        else return 0.0;
    } else if (g == 13) {
        // M
        if (y == 0) row = 17; // #...#
        else if (y == 1) row = 27; // ##.##
        else if (y == 2 || y == 3) row = 21; // #.#.#
        else if (y == 4 || y == 5) row = 17; // #...#
        else return 0.0;
    } else if (g == 14) {
        // @
        if (y == 0 || y == 6) row = 14; // .###.
        else if (y == 1) row = 17; // #...#
        else if (y == 2) row = 23; // #.###
        else if (y == 3) row = 21; // #.#.#
        else if (y == 4) row = 22; // #.##.
        else if (y == 5) row = 16; // #....
        else return 0.0;
    } else {
        // full block
        return 1.0;
    }

    // Extract bit: bit (4 - x) from row
    int bit = (row >> (4 - x)) & 1;
    return float(bit);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 pixelCoord = gl_FragCoord.xy;

    // Scale cell size by renderScale so glyphs maintain their visual size
    // regardless of export resolution.
    int cs = max(int(float(cellSize) * renderScale), 1);
    float csf = float(cs);

    // Which cell are we in?
    vec2 cellIndex = floor(pixelCoord / csf);

    // Local position within the cell, mapped to 5x7 glyph grid
    vec2 localPos = fract(pixelCoord / csf);
    int gx = int(floor(localPos.x * 5.0));
    int gy = int(floor(localPos.y * 7.0));
    gx = clamp(gx, 0, 4);
    gy = clamp(gy, 0, 6);

    // Sample the center of the cell for brightness
    vec2 cellCenter = (cellIndex + 0.5) * csf;
    vec2 sampleUV = cellCenter / resolution;
    vec4 srcColor = texture(inputTex, sampleUV);

    // Compute luminance
    float luma = dot(srcColor.rgb, vec3(0.299, 0.587, 0.114));

    // Map luminance to glyph index (0 to GLYPH_COUNT-1)
    int glyphIdx = int(floor(luma * float(GLYPH_COUNT)));
    glyphIdx = clamp(glyphIdx, 0, GLYPH_COUNT - 1);

    // Use seed to rotate/shift the glyph selection for variety
    float cellHash = hash(cellIndex + float(seed) * 0.37);
    int variant = int(floor(cellHash * 3.0)); // 0, 1, or 2

    // Shift glyph index by variant within a small range for variety
    // but keep it in the same density neighborhood
    if (variant == 1 && glyphIdx > 0 && glyphIdx < GLYPH_COUNT - 1) {
        glyphIdx = glyphIdx; // keep same — variant 0 and 1 share
    } else if (variant == 2 && glyphIdx > 1) {
        glyphIdx = glyphIdx - 1; // slightly less dense variant
    }

    // Get the glyph pixel value
    float glyphVal = glyphPixel(glyphIdx, gx, gy);

    if (colorMode > 0) {
        fragColor = vec4(srcColor.rgb * glyphVal, 1.0);
    } else {
        fragColor = vec4(vec3(glyphVal), 1.0);
    }
}
