/*
 * Ordered dithering effect
 * Applies various dithering patterns and color palettes for retro aesthetics
 */

struct Uniforms {
    ditherType: i32,
    palette: i32,
    _pad0: i32,
    _pad1: i32,
    threshold: f32,
    matrixScale: f32,
    time: f32,
    mix: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Dither type constants
const DITHER_BAYER_2X2: i32 = 0;
const DITHER_BAYER_4X4: i32 = 1;
const DITHER_BAYER_8X8: i32 = 2;
const DITHER_DOT: i32 = 3;
const DITHER_LINE: i32 = 4;
const DITHER_CROSSHATCH: i32 = 5;
const DITHER_NOISE: i32 = 6;

// Palette constants
const PALETTE_INPUT_1BIT: i32 = 0;
const PALETTE_INPUT_2BIT: i32 = 1;
const PALETTE_MONOCHROME: i32 = 2;
const PALETTE_DOT_MATRIX_GREEN: i32 = 3;
const PALETTE_AMBER: i32 = 4;
const PALETTE_PICO8: i32 = 5;
const PALETTE_C64: i32 = 6;
const PALETTE_CGA: i32 = 7;
const PALETTE_ZX_SPECTRUM: i32 = 8;
const PALETTE_APPLE_II: i32 = 9;
const PALETTE_EGA: i32 = 10;

// Bayer 2x2 matrix values
fn getBayer2x2(x: i32, y: i32) -> f32 {
    let bayer = array<f32, 4>(
        0.0/4.0, 2.0/4.0,
        3.0/4.0, 1.0/4.0
    );
    let idx = (y & 1) * 2 + (x & 1);
    return bayer[idx];
}

// Bayer 4x4 matrix values
fn getBayer4x4(x: i32, y: i32) -> f32 {
    let bayer = array<f32, 16>(
         0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
        12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
         3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
        15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
    );
    let idx = (y & 3) * 4 + (x & 3);
    return bayer[idx];
}

// 8x8 Bayer matrix - using lookup for correctness
fn getBayer8x8(x: i32, y: i32) -> f32 {
    let xm = x & 7;
    let ym = y & 7;
    
    // Standard 8x8 ordered dither matrix
    let bayer8 = array<f32, 64>(
         0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
        48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
        12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
        60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
         3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
        51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
        15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
        63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
    );
    
    return bayer8[ym * 8 + xm];
}

// Hash function for noise dithering
fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Dot pattern dithering
fn dotPattern(uv: vec2<f32>, scale: f32) -> f32 {
    let p = uv * scale;
    let d = length(fract(p) - 0.5);
    return smoothstep(0.5, 0.0, d);
}

// Line pattern dithering
fn linePattern(uv: vec2<f32>, scale: f32) -> f32 {
    let p = uv.y * scale;
    return abs(fract(p) - 0.5) * 2.0;
}

// Crosshatch pattern
fn crosshatchPattern(uv: vec2<f32>, scale: f32) -> f32 {
    let p = uv * scale;
    let line1 = abs(fract(p.x + p.y) - 0.5) * 2.0;
    let line2 = abs(fract(p.x - p.y) - 0.5) * 2.0;
    return min(line1, line2);
}

// Get dither threshold based on type and position
// matrixScale determines how many screen pixels each matrix cell covers
// e.g., scale=1 means 1:1, scale=2 means each cell is 2x2 screen pixels
fn getDitherThreshold(pixelCoord: vec2<f32>, ditherType: i32, scale: f32, time: f32) -> f32 {
    // Scale the pixel coordinate - larger scale = bigger pattern cells
    let scaledCoord = floor(pixelCoord / scale);
    let x = i32(scaledCoord.x);
    let y = i32(scaledCoord.y);
    
    if (ditherType == DITHER_BAYER_2X2) {
        return getBayer2x2(x, y);
    } else if (ditherType == DITHER_BAYER_4X4) {
        return getBayer4x4(x, y);
    } else if (ditherType == DITHER_BAYER_8X8) {
        return getBayer8x8(x, y);
    } else if (ditherType == DITHER_DOT) {
        // Dot pattern with 8-pixel base, scaled (larger scale = bigger dots)
        return dotPattern(pixelCoord, 1.0 / (8.0 * scale));
    } else if (ditherType == DITHER_LINE) {
        // Line pattern with 8-pixel base
        return linePattern(pixelCoord, 1.0 / (8.0 * scale));
    } else if (ditherType == DITHER_CROSSHATCH) {
        // Crosshatch pattern with 8-pixel base
        return crosshatchPattern(pixelCoord, 1.0 / (8.0 * scale));
    } else if (ditherType == DITHER_NOISE) {
        // Noise pattern: scale determines block size
        return hash(scaledCoord + time * 0.001);
    }
    
    return 0.5;
}


// Quantize color to specified levels with dithering
fn quantizeWithDither(color: vec3<f32>, levels: f32, ditherValue: f32, thresh: f32) -> vec3<f32> {
    let adjustedDither = ditherValue - 0.5 + thresh;
    let dithered = color + adjustedDither / levels;
    return floor(dithered * levels) / (levels - 1.0);
}

// Color distance in RGB space
fn colorDistance(a: vec3<f32>, b: vec3<f32>) -> f32 {
    let diff = a - b;
    return dot(diff, diff);
}

// Palette color arrays
fn getDotMatrixGreen(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.06, 0.22, 0.06); }
        case 1: { return vec3<f32>(0.19, 0.38, 0.19); }
        case 2: { return vec3<f32>(0.55, 0.67, 0.06); }
        default: { return vec3<f32>(0.61, 0.74, 0.06); }
    }
}

fn getAmber(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(0.4, 0.2, 0.0); }
        case 2: { return vec3<f32>(0.8, 0.4, 0.0); }
        default: { return vec3<f32>(1.0, 0.6, 0.0); }
    }
}

fn getCGA(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(0.0, 1.0, 1.0); }
        case 2: { return vec3<f32>(1.0, 0.0, 1.0); }
        default: { return vec3<f32>(1.0, 1.0, 1.0); }
    }
}

fn getPico8(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(0.114, 0.169, 0.325); }
        case 2: { return vec3<f32>(0.494, 0.145, 0.325); }
        case 3: { return vec3<f32>(0.0, 0.529, 0.318); }
        case 4: { return vec3<f32>(0.671, 0.322, 0.212); }
        case 5: { return vec3<f32>(0.373, 0.341, 0.310); }
        case 6: { return vec3<f32>(0.761, 0.765, 0.780); }
        case 7: { return vec3<f32>(1.0, 0.945, 0.910); }
        case 8: { return vec3<f32>(1.0, 0.0, 0.302); }
        case 9: { return vec3<f32>(1.0, 0.639, 0.0); }
        case 10: { return vec3<f32>(1.0, 0.925, 0.153); }
        case 11: { return vec3<f32>(0.0, 0.894, 0.212); }
        case 12: { return vec3<f32>(0.161, 0.678, 1.0); }
        case 13: { return vec3<f32>(0.514, 0.463, 0.612); }
        case 14: { return vec3<f32>(1.0, 0.467, 0.659); }
        default: { return vec3<f32>(1.0, 0.8, 0.667); }
    }
}

fn getC64(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(1.0, 1.0, 1.0); }
        case 2: { return vec3<f32>(0.533, 0.0, 0.0); }
        case 3: { return vec3<f32>(0.667, 1.0, 0.933); }
        case 4: { return vec3<f32>(0.8, 0.267, 0.8); }
        case 5: { return vec3<f32>(0.0, 0.8, 0.333); }
        case 6: { return vec3<f32>(0.0, 0.0, 0.667); }
        case 7: { return vec3<f32>(0.933, 0.933, 0.467); }
        case 8: { return vec3<f32>(0.867, 0.533, 0.333); }
        case 9: { return vec3<f32>(0.4, 0.267, 0.0); }
        case 10: { return vec3<f32>(1.0, 0.467, 0.467); }
        case 11: { return vec3<f32>(0.2, 0.2, 0.2); }
        case 12: { return vec3<f32>(0.467, 0.467, 0.467); }
        case 13: { return vec3<f32>(0.667, 1.0, 0.4); }
        case 14: { return vec3<f32>(0.0, 0.533, 1.0); }
        default: { return vec3<f32>(0.6, 0.6, 0.6); }
    }
}

fn getZXSpectrum(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(0.0, 0.0, 0.839); }
        case 2: { return vec3<f32>(0.839, 0.0, 0.0); }
        case 3: { return vec3<f32>(0.839, 0.0, 0.839); }
        case 4: { return vec3<f32>(0.0, 0.839, 0.0); }
        case 5: { return vec3<f32>(0.0, 0.839, 0.839); }
        case 6: { return vec3<f32>(0.839, 0.839, 0.0); }
        case 7: { return vec3<f32>(0.839, 0.839, 0.839); }
        case 8: { return vec3<f32>(0.0, 0.0, 1.0); }
        case 9: { return vec3<f32>(1.0, 0.0, 0.0); }
        case 10: { return vec3<f32>(1.0, 0.0, 1.0); }
        case 11: { return vec3<f32>(0.0, 1.0, 0.0); }
        case 12: { return vec3<f32>(0.0, 1.0, 1.0); }
        case 13: { return vec3<f32>(1.0, 1.0, 0.0); }
        default: { return vec3<f32>(1.0, 1.0, 1.0); }
    }
}

fn getAppleII(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(0.882, 0.0, 0.494); }
        case 2: { return vec3<f32>(0.247, 0.0, 0.682); }
        case 3: { return vec3<f32>(1.0, 0.0, 1.0); }
        case 4: { return vec3<f32>(0.0, 0.494, 0.263); }
        case 5: { return vec3<f32>(0.502, 0.502, 0.502); }
        case 6: { return vec3<f32>(0.0, 0.325, 1.0); }
        case 7: { return vec3<f32>(0.667, 0.671, 1.0); }
        case 8: { return vec3<f32>(0.502, 0.302, 0.0); }
        case 9: { return vec3<f32>(1.0, 0.467, 0.0); }
        case 10: { return vec3<f32>(0.502, 0.502, 0.502); }
        case 11: { return vec3<f32>(1.0, 0.616, 0.667); }
        case 12: { return vec3<f32>(0.0, 0.831, 0.0); }
        case 13: { return vec3<f32>(1.0, 1.0, 0.0); }
        case 14: { return vec3<f32>(0.333, 1.0, 0.557); }
        default: { return vec3<f32>(1.0, 1.0, 1.0); }
    }
}

fn getEGA(i: i32) -> vec3<f32> {
    switch(i) {
        case 0: { return vec3<f32>(0.0, 0.0, 0.0); }
        case 1: { return vec3<f32>(0.0, 0.0, 0.667); }
        case 2: { return vec3<f32>(0.0, 0.667, 0.0); }
        case 3: { return vec3<f32>(0.0, 0.667, 0.667); }
        case 4: { return vec3<f32>(0.667, 0.0, 0.0); }
        case 5: { return vec3<f32>(0.667, 0.0, 0.667); }
        case 6: { return vec3<f32>(0.667, 0.333, 0.0); }
        case 7: { return vec3<f32>(0.667, 0.667, 0.667); }
        case 8: { return vec3<f32>(0.333, 0.333, 0.333); }
        case 9: { return vec3<f32>(0.333, 0.333, 1.0); }
        case 10: { return vec3<f32>(0.333, 1.0, 0.333); }
        case 11: { return vec3<f32>(0.333, 1.0, 1.0); }
        case 12: { return vec3<f32>(1.0, 0.333, 0.333); }
        case 13: { return vec3<f32>(1.0, 0.333, 1.0); }
        case 14: { return vec3<f32>(1.0, 1.0, 0.333); }
        default: { return vec3<f32>(1.0, 1.0, 1.0); }
    }
}

// Find closest color in palette
fn findClosestPaletteColor(color: vec3<f32>, paletteType: i32) -> vec3<f32> {
    if (paletteType == PALETTE_MONOCHROME) {
        let luma = dot(color, vec3<f32>(0.299, 0.587, 0.114));
        if (luma > 0.5) {
            return vec3<f32>(1.0);
        } else {
            return vec3<f32>(0.0);
        }
    }
    
    var closest = vec3<f32>(0.0);
    var minDist = 999999.0;
    var count = 16;
    
    if (paletteType == PALETTE_DOT_MATRIX_GREEN || paletteType == PALETTE_AMBER || paletteType == PALETTE_CGA) {
        count = 4;
    } else if (paletteType == PALETTE_ZX_SPECTRUM) {
        count = 15;
    }
    
    for (var i = 0; i < count; i = i + 1) {
        var palColor = vec3<f32>(0.0);
        
        if (paletteType == PALETTE_DOT_MATRIX_GREEN) {
            palColor = getDotMatrixGreen(i);
        } else if (paletteType == PALETTE_AMBER) {
            palColor = getAmber(i);
        } else if (paletteType == PALETTE_PICO8) {
            palColor = getPico8(i);
        } else if (paletteType == PALETTE_C64) {
            palColor = getC64(i);
        } else if (paletteType == PALETTE_CGA) {
            palColor = getCGA(i);
        } else if (paletteType == PALETTE_ZX_SPECTRUM) {
            palColor = getZXSpectrum(i);
        } else if (paletteType == PALETTE_APPLE_II) {
            palColor = getAppleII(i);
        } else if (paletteType == PALETTE_EGA) {
            palColor = getEGA(i);
        }
        
        let dist = colorDistance(color, palColor);
        if (dist < minDist) {
            minDist = dist;
            closest = palColor;
        }
    }
    
    return closest;
}

// Apply palette-based dithering
fn ditherWithPalette(color: vec3<f32>, ditherValue: f32, thresh: f32, paletteType: i32) -> vec3<f32> {
    let dithered = clamp(color + (ditherValue - 0.5 + thresh) * 0.25, vec3<f32>(0.0), vec3<f32>(1.0));
    return findClosestPaletteColor(dithered, paletteType);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    
    var color = textureSample(inputTex, inputSampler, uv);
    
    // Get dither threshold for current pixel
    let ditherValue = getDitherThreshold(pos.xy, uniforms.ditherType, uniforms.matrixScale, uniforms.time);
    
    var result: vec3<f32>;
    
    if (uniforms.palette == PALETTE_INPUT_1BIT) {
        // 1-bit: 2 colors per channel
        result = quantizeWithDither(color.rgb, 2.0, ditherValue, uniforms.threshold);
    } else if (uniforms.palette == PALETTE_INPUT_2BIT) {
        // 2-bit: 4 colors per channel
        result = quantizeWithDither(color.rgb, 4.0, ditherValue, uniforms.threshold);
    } else {
        // Use palette-based dithering
        result = ditherWithPalette(color.rgb, ditherValue, uniforms.threshold, uniforms.palette);
    }
    
    // Blend between original input and dithered result
    result = mix(color.rgb, result, uniforms.mix);
    
    return vec4<f32>(result, color.a);
}
