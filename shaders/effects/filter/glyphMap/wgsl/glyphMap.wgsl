/*
 * Glyph Map effect
 * Converts image to ASCII/glyph art using hardcoded 5x7 glyph bitmaps
 * ordered by density. Each cell maps input brightness to a glyph.
 */

struct Uniforms {
    cellSize: i32,
    seed: i32,
    colorMode: i32,
    _pad: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const GLYPH_COUNT: i32 = 16;

// PCG PRNG
fn pcg(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

// Hash for glyph variant selection per cell
fn hash(p: vec2<f32>) -> f32 {
    let v = pcg(vec3<u32>(
        u32(select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0)),
        u32(select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0)),
        0u
    ));
    return f32(v.x) / f32(0xffffffffu);
}

// Get one row (5 bits) of a glyph bitmap
// g: glyph index (0-15), y: row (0-6)
// Returns the 5-bit row value
fn glyphRow(g: i32, y: i32) -> i32 {
    // Glyph 0: space
    if (g == 0) { return 0; }
    // Glyph 1: period
    if (g == 1) {
        if (y == 5) { return 4; }
        return 0;
    }
    // Glyph 2: colon
    if (g == 2) {
        if (y == 1 || y == 5) { return 4; }
        return 0;
    }
    // Glyph 3: dash
    if (g == 3) {
        if (y == 3) { return 14; }
        return 0;
    }
    // Glyph 4: plus
    if (g == 4) {
        if (y == 1 || y == 2 || y == 4 || y == 5) { return 4; }
        if (y == 3) { return 14; }
        return 0;
    }
    // Glyph 5: equals
    if (g == 5) {
        if (y == 2 || y == 4) { return 14; }
        return 0;
    }
    // Glyph 6: asterisk
    if (g == 6) {
        if (y == 1 || y == 5) { return 10; }
        if (y == 2 || y == 4) { return 4; }
        if (y == 3) { return 14; }
        return 0;
    }
    // Glyph 7: o
    if (g == 7) {
        if (y == 2 || y == 5) { return 14; }
        if (y == 3 || y == 4) { return 10; }
        return 0;
    }
    // Glyph 8: X
    if (g == 8) {
        if (y == 1 || y == 2 || y == 4 || y == 5) { return 10; }
        if (y == 3) { return 4; }
        return 0;
    }
    // Glyph 9: hash #
    if (g == 9) {
        if (y == 1 || y == 3 || y == 5) { return 10; }
        if (y == 2 || y == 4) { return 31; }
        return 0;
    }
    // Glyph 10: percent %
    if (g == 10) {
        if (y == 0) { return 25; }
        if (y == 1) { return 26; }
        if (y == 2) { return 4; }
        if (y == 3) { return 9; }
        if (y == 4) { return 11; }
        if (y == 5) { return 19; }
        return 0;
    }
    // Glyph 11: A
    if (g == 11) {
        if (y == 0) { return 4; }
        if (y == 1) { return 10; }
        if (y == 2) { return 17; }
        if (y == 3) { return 31; }
        if (y == 4 || y == 5) { return 17; }
        return 0;
    }
    // Glyph 12: W
    if (g == 12) {
        if (y == 0 || y == 1) { return 17; }
        if (y == 2 || y == 3) { return 21; }
        if (y == 4) { return 27; }
        if (y == 5) { return 10; }
        return 0;
    }
    // Glyph 13: M
    if (g == 13) {
        if (y == 0) { return 17; }
        if (y == 1) { return 27; }
        if (y == 2 || y == 3) { return 21; }
        if (y == 4 || y == 5) { return 17; }
        return 0;
    }
    // Glyph 14: @
    if (g == 14) {
        if (y == 0 || y == 6) { return 14; }
        if (y == 1) { return 17; }
        if (y == 2) { return 23; }
        if (y == 3) { return 21; }
        if (y == 4) { return 22; }
        if (y == 5) { return 16; }
        return 0;
    }
    // Glyph 15: full block
    return 31;
}

// Return 1.0 if pixel (x, y) is set in glyph g, else 0.0
fn glyphPixel(g: i32, x: i32, y: i32) -> f32 {
    let row = glyphRow(g, y);
    // WGSL requires the right-hand side of `>>` to be a u32 (or vecN<u32>)
    let bit = (row >> u32(4 - x)) & 1;
    return f32(bit);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let pixelCoord = pos.xy;

    let cs = max(uniforms.cellSize, 1);
    let csf = f32(cs);

    // Which cell are we in?
    let cellIndex = floor(pixelCoord / csf);

    // Local position within the cell, mapped to 5x7 glyph grid
    let localPos = fract(pixelCoord / csf);
    var gx = i32(floor(localPos.x * 5.0));
    var gy = i32(floor(localPos.y * 7.0));
    gx = clamp(gx, 0, 4);
    gy = clamp(gy, 0, 6);

    // Sample the center of the cell for brightness
    let cellCenter = (cellIndex + 0.5) * csf;
    let sampleUV = cellCenter / texSize;
    let srcColor = textureSample(inputTex, inputSampler, sampleUV);

    // Compute luminance
    let luma = dot(srcColor.rgb, vec3<f32>(0.299, 0.587, 0.114));

    // Map luminance to glyph index (0 to GLYPH_COUNT-1)
    var glyphIdx = i32(floor(luma * f32(GLYPH_COUNT)));
    glyphIdx = clamp(glyphIdx, 0, GLYPH_COUNT - 1);

    // Use seed to rotate/shift glyph selection for variety
    let cellHash = hash(cellIndex + f32(uniforms.seed) * 0.37);
    let variant = i32(floor(cellHash * 3.0));

    if (variant == 2 && glyphIdx > 1) {
        glyphIdx = glyphIdx - 1;
    }

    // Get the glyph pixel value
    let glyphVal = glyphPixel(glyphIdx, gx, gy);

    if (uniforms.colorMode > 0) {
        return vec4<f32>(srcColor.rgb * glyphVal, 1.0);
    } else {
        return vec4<f32>(vec3<f32>(glyphVal), 1.0);
    }
}
