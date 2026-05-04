/*
 * Ordered dithering effect
 * Applies various dithering patterns and color palettes for retro aesthetics
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int ditherType;
uniform float threshold;
uniform float matrixScale;
uniform float renderScale;
uniform int palette;
uniform float time;
uniform float mixAmount;

out vec4 fragColor;

// Dither type constants
const int DITHER_BAYER_2X2 = 0;
const int DITHER_BAYER_4X4 = 1;
const int DITHER_BAYER_8X8 = 2;
const int DITHER_DOT = 3;
const int DITHER_LINE = 4;
const int DITHER_CROSSHATCH = 5;
const int DITHER_NOISE = 6;

// Palette constants
const int PALETTE_INPUT_1BIT = 0;
const int PALETTE_INPUT_2BIT = 1;
const int PALETTE_MONOCHROME = 2;
const int PALETTE_DOT_MATRIX_GREEN = 3;
const int PALETTE_AMBER = 4;
const int PALETTE_PICO8 = 5;
const int PALETTE_C64 = 6;
const int PALETTE_CGA = 7;
const int PALETTE_ZX_SPECTRUM = 8;
const int PALETTE_APPLE_II = 9;
const int PALETTE_EGA = 10;

// Bayer matrices
const mat4 bayer2x2 = mat4(
    0.0/4.0, 2.0/4.0, 0.0/4.0, 2.0/4.0,
    3.0/4.0, 1.0/4.0, 3.0/4.0, 1.0/4.0,
    0.0/4.0, 2.0/4.0, 0.0/4.0, 2.0/4.0,
    3.0/4.0, 1.0/4.0, 3.0/4.0, 1.0/4.0
);

const mat4 bayer4x4 = mat4(
     0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
    12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
     3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
    15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
);

// 8x8 Bayer matrix - using lookup for correctness
float getBayer8x8(int x, int y) {
    x = x & 7;
    y = y & 7;
    
    // Standard 8x8 ordered dither matrix (normalized will divide by 64)
    // Row 0
    if (y == 0) {
        if (x == 0) return  0.0/64.0;
        if (x == 1) return 32.0/64.0;
        if (x == 2) return  8.0/64.0;
        if (x == 3) return 40.0/64.0;
        if (x == 4) return  2.0/64.0;
        if (x == 5) return 34.0/64.0;
        if (x == 6) return 10.0/64.0;
        return 42.0/64.0;
    }
    // Row 1
    if (y == 1) {
        if (x == 0) return 48.0/64.0;
        if (x == 1) return 16.0/64.0;
        if (x == 2) return 56.0/64.0;
        if (x == 3) return 24.0/64.0;
        if (x == 4) return 50.0/64.0;
        if (x == 5) return 18.0/64.0;
        if (x == 6) return 58.0/64.0;
        return 26.0/64.0;
    }
    // Row 2
    if (y == 2) {
        if (x == 0) return 12.0/64.0;
        if (x == 1) return 44.0/64.0;
        if (x == 2) return  4.0/64.0;
        if (x == 3) return 36.0/64.0;
        if (x == 4) return 14.0/64.0;
        if (x == 5) return 46.0/64.0;
        if (x == 6) return  6.0/64.0;
        return 38.0/64.0;
    }
    // Row 3
    if (y == 3) {
        if (x == 0) return 60.0/64.0;
        if (x == 1) return 28.0/64.0;
        if (x == 2) return 52.0/64.0;
        if (x == 3) return 20.0/64.0;
        if (x == 4) return 62.0/64.0;
        if (x == 5) return 30.0/64.0;
        if (x == 6) return 54.0/64.0;
        return 22.0/64.0;
    }
    // Row 4
    if (y == 4) {
        if (x == 0) return  3.0/64.0;
        if (x == 1) return 35.0/64.0;
        if (x == 2) return 11.0/64.0;
        if (x == 3) return 43.0/64.0;
        if (x == 4) return  1.0/64.0;
        if (x == 5) return 33.0/64.0;
        if (x == 6) return  9.0/64.0;
        return 41.0/64.0;
    }
    // Row 5
    if (y == 5) {
        if (x == 0) return 51.0/64.0;
        if (x == 1) return 19.0/64.0;
        if (x == 2) return 59.0/64.0;
        if (x == 3) return 27.0/64.0;
        if (x == 4) return 49.0/64.0;
        if (x == 5) return 17.0/64.0;
        if (x == 6) return 57.0/64.0;
        return 25.0/64.0;
    }
    // Row 6
    if (y == 6) {
        if (x == 0) return 15.0/64.0;
        if (x == 1) return 47.0/64.0;
        if (x == 2) return  7.0/64.0;
        if (x == 3) return 39.0/64.0;
        if (x == 4) return 13.0/64.0;
        if (x == 5) return 45.0/64.0;
        if (x == 6) return  5.0/64.0;
        return 37.0/64.0;
    }
    // Row 7
    if (x == 0) return 63.0/64.0;
    if (x == 1) return 31.0/64.0;
    if (x == 2) return 55.0/64.0;
    if (x == 3) return 23.0/64.0;
    if (x == 4) return 61.0/64.0;
    if (x == 5) return 29.0/64.0;
    if (x == 6) return 53.0/64.0;
    return 21.0/64.0;
}

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

// Hash function for noise dithering
float hash(vec2 p) {
    uvec3 v = pcg(uvec3(
        uint(p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0),
        uint(p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0),
        0u
    ));
    return float(v.x) / float(0xffffffffu);
}

// Dot pattern dithering
float dotPattern(vec2 uv, float scale) {
    vec2 p = uv * scale;
    vec2 c = floor(p) + 0.5;
    float d = length(fract(p) - 0.5);
    return smoothstep(0.5, 0.0, d);
}

// Line pattern dithering
float linePattern(vec2 uv, float scale) {
    float p = uv.y * scale;
    return abs(fract(p) - 0.5) * 2.0;
}

// Crosshatch pattern
float crosshatchPattern(vec2 uv, float scale) {
    vec2 p = uv * scale;
    float line1 = abs(fract(p.x + p.y) - 0.5) * 2.0;
    float line2 = abs(fract(p.x - p.y) - 0.5) * 2.0;
    return min(line1, line2);
}

// Get dither threshold based on type and position
// matrixScale determines how many screen pixels each matrix cell covers
// e.g., scale=1 means 1:1, scale=2 means each cell is 2x2 screen pixels
float getDitherThreshold(vec2 pixelCoord, int type, float scale) {
    // Scale the pixel coordinate - larger scale = bigger pattern cells
    vec2 scaledCoord = floor(pixelCoord / scale);
    int x = int(scaledCoord.x);
    int y = int(scaledCoord.y);
    
    if (type == DITHER_BAYER_2X2) {
        return bayer2x2[y & 1][x & 1];
    } else if (type == DITHER_BAYER_4X4) {
        return bayer4x4[y & 3][x & 3];
    } else if (type == DITHER_BAYER_8X8) {
        return getBayer8x8(x, y);
    } else if (type == DITHER_DOT) {
        // Dot pattern with 8-pixel base, scaled (larger scale = bigger dots)
        return dotPattern(pixelCoord, 1.0 / (8.0 * scale));
    } else if (type == DITHER_LINE) {
        // Line pattern with 8-pixel base
        return linePattern(pixelCoord, 1.0 / (8.0 * scale));
    } else if (type == DITHER_CROSSHATCH) {
        // Crosshatch pattern with 8-pixel base
        return crosshatchPattern(pixelCoord, 1.0 / (8.0 * scale));
    } else if (type == DITHER_NOISE) {
        // Noise pattern: scale determines block size
        return hash(scaledCoord + time * 0.001);
    }
    
    return 0.5;
}

// Quantize color to specified levels with dithering
vec3 quantizeWithDither(vec3 color, float levels, float ditherValue, float thresh) {
    float adjustedDither = (ditherValue - 0.5 + thresh);
    vec3 dithered = color + adjustedDither / levels;
    return floor(dithered * levels) / (levels - 1.0);
}

// Find closest color in palette
vec3 findClosestPaletteColor(vec3 color, int paletteType);

// Palette definitions

// Dot matrix green (Game Boy-like)
const vec3 DOT_MATRIX[4] = vec3[4](
    vec3(0.06, 0.22, 0.06),   // Darkest
    vec3(0.19, 0.38, 0.19),
    vec3(0.55, 0.67, 0.06),
    vec3(0.61, 0.74, 0.06)    // Lightest
);

// Amber monitor
const vec3 AMBER[4] = vec3[4](
    vec3(0.0, 0.0, 0.0),
    vec3(0.4, 0.2, 0.0),
    vec3(0.8, 0.4, 0.0),
    vec3(1.0, 0.6, 0.0)
);

// PICO-8 palette (16 colors)
const vec3 PICO8[16] = vec3[16](
    vec3(0.0, 0.0, 0.0),
    vec3(0.114, 0.169, 0.325),
    vec3(0.494, 0.145, 0.325),
    vec3(0.0, 0.529, 0.318),
    vec3(0.671, 0.322, 0.212),
    vec3(0.373, 0.341, 0.310),
    vec3(0.761, 0.765, 0.780),
    vec3(1.0, 0.945, 0.910),
    vec3(1.0, 0.0, 0.302),
    vec3(1.0, 0.639, 0.0),
    vec3(1.0, 0.925, 0.153),
    vec3(0.0, 0.894, 0.212),
    vec3(0.161, 0.678, 1.0),
    vec3(0.514, 0.463, 0.612),
    vec3(1.0, 0.467, 0.659),
    vec3(1.0, 0.8, 0.667)
);

// Commodore 64 palette (16 colors)
const vec3 C64[16] = vec3[16](
    vec3(0.0, 0.0, 0.0),
    vec3(1.0, 1.0, 1.0),
    vec3(0.533, 0.0, 0.0),
    vec3(0.667, 1.0, 0.933),
    vec3(0.8, 0.267, 0.8),
    vec3(0.0, 0.8, 0.333),
    vec3(0.0, 0.0, 0.667),
    vec3(0.933, 0.933, 0.467),
    vec3(0.867, 0.533, 0.333),
    vec3(0.4, 0.267, 0.0),
    vec3(1.0, 0.467, 0.467),
    vec3(0.2, 0.2, 0.2),
    vec3(0.467, 0.467, 0.467),
    vec3(0.667, 1.0, 0.4),
    vec3(0.0, 0.533, 1.0),
    vec3(0.6, 0.6, 0.6)
);

// CGA Palette 1 (cyan, magenta, white + black)
const vec3 CGA[4] = vec3[4](
    vec3(0.0, 0.0, 0.0),
    vec3(0.0, 1.0, 1.0),
    vec3(1.0, 0.0, 1.0),
    vec3(1.0, 1.0, 1.0)
);

// ZX Spectrum (15 colors - 8 normal + 7 bright, black only once)
const vec3 ZX_SPECTRUM[15] = vec3[15](
    vec3(0.0, 0.0, 0.0),
    vec3(0.0, 0.0, 0.839),
    vec3(0.839, 0.0, 0.0),
    vec3(0.839, 0.0, 0.839),
    vec3(0.0, 0.839, 0.0),
    vec3(0.0, 0.839, 0.839),
    vec3(0.839, 0.839, 0.0),
    vec3(0.839, 0.839, 0.839),
    vec3(0.0, 0.0, 1.0),
    vec3(1.0, 0.0, 0.0),
    vec3(1.0, 0.0, 1.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 1.0, 1.0),
    vec3(1.0, 1.0, 0.0),
    vec3(1.0, 1.0, 1.0)
);

// Apple II (16 colors)
const vec3 APPLE_II[16] = vec3[16](
    vec3(0.0, 0.0, 0.0),
    vec3(0.882, 0.0, 0.494),
    vec3(0.247, 0.0, 0.682),
    vec3(1.0, 0.0, 1.0),
    vec3(0.0, 0.494, 0.263),
    vec3(0.502, 0.502, 0.502),
    vec3(0.0, 0.325, 1.0),
    vec3(0.667, 0.671, 1.0),
    vec3(0.502, 0.302, 0.0),
    vec3(1.0, 0.467, 0.0),
    vec3(0.502, 0.502, 0.502),
    vec3(1.0, 0.616, 0.667),
    vec3(0.0, 0.831, 0.0),
    vec3(1.0, 1.0, 0.0),
    vec3(0.333, 1.0, 0.557),
    vec3(1.0, 1.0, 1.0)
);

// EGA palette (16 colors)
const vec3 EGA[16] = vec3[16](
    vec3(0.0, 0.0, 0.0),
    vec3(0.0, 0.0, 0.667),
    vec3(0.0, 0.667, 0.0),
    vec3(0.0, 0.667, 0.667),
    vec3(0.667, 0.0, 0.0),
    vec3(0.667, 0.0, 0.667),
    vec3(0.667, 0.333, 0.0),
    vec3(0.667, 0.667, 0.667),
    vec3(0.333, 0.333, 0.333),
    vec3(0.333, 0.333, 1.0),
    vec3(0.333, 1.0, 0.333),
    vec3(0.333, 1.0, 1.0),
    vec3(1.0, 0.333, 0.333),
    vec3(1.0, 0.333, 1.0),
    vec3(1.0, 1.0, 0.333),
    vec3(1.0, 1.0, 1.0)
);

// Color distance in RGB space
float colorDistance(vec3 a, vec3 b) {
    vec3 diff = a - b;
    return dot(diff, diff);
}

// Find closest color in a 4-color palette
vec3 findClosest4(vec3 color, vec3 pal[4]) {
    vec3 closest = pal[0];
    float minDist = colorDistance(color, pal[0]);
    
    for (int i = 1; i < 4; i++) {
        float dist = colorDistance(color, pal[i]);
        if (dist < minDist) {
            minDist = dist;
            closest = pal[i];
        }
    }
    return closest;
}

// Find closest color in a 15-color palette
vec3 findClosest15(vec3 color, vec3 pal[15]) {
    vec3 closest = pal[0];
    float minDist = colorDistance(color, pal[0]);
    
    for (int i = 1; i < 15; i++) {
        float dist = colorDistance(color, pal[i]);
        if (dist < minDist) {
            minDist = dist;
            closest = pal[i];
        }
    }
    return closest;
}

// Find closest color in a 16-color palette
vec3 findClosest16(vec3 color, vec3 pal[16]) {
    vec3 closest = pal[0];
    float minDist = colorDistance(color, pal[0]);
    
    for (int i = 1; i < 16; i++) {
        float dist = colorDistance(color, pal[i]);
        if (dist < minDist) {
            minDist = dist;
            closest = pal[i];
        }
    }
    return closest;
}

vec3 findClosestPaletteColor(vec3 color, int paletteType) {
    if (paletteType == PALETTE_MONOCHROME) {
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        return vec3(luma > 0.5 ? 1.0 : 0.0);
    } else if (paletteType == PALETTE_DOT_MATRIX_GREEN) {
        return findClosest4(color, DOT_MATRIX);
    } else if (paletteType == PALETTE_AMBER) {
        return findClosest4(color, AMBER);
    } else if (paletteType == PALETTE_PICO8) {
        return findClosest16(color, PICO8);
    } else if (paletteType == PALETTE_C64) {
        return findClosest16(color, C64);
    } else if (paletteType == PALETTE_CGA) {
        return findClosest4(color, CGA);
    } else if (paletteType == PALETTE_ZX_SPECTRUM) {
        return findClosest15(color, ZX_SPECTRUM);
    } else if (paletteType == PALETTE_APPLE_II) {
        return findClosest16(color, APPLE_II);
    } else if (paletteType == PALETTE_EGA) {
        return findClosest16(color, EGA);
    }
    return color;
}

// Apply palette-based dithering
vec3 ditherWithPalette(vec3 color, float ditherValue, float thresh, int paletteType) {
    // Add dither offset before finding closest color
    vec3 dithered = color + (ditherValue - 0.5 + thresh) * 0.25;
    dithered = clamp(dithered, 0.0, 1.0);
    return findClosestPaletteColor(dithered, paletteType);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    vec4 color = texture(inputTex, uv);

    // Use global pixel coordinate for dither pattern so it aligns across tiles
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    // Get dither threshold for current pixel
    float ditherValue = getDitherThreshold(globalCoord, ditherType, matrixScale * renderScale);
    
    vec3 result;
    
    if (palette == PALETTE_INPUT_1BIT) {
        // 1-bit: 2 colors per channel
        result = quantizeWithDither(color.rgb, 2.0, ditherValue, threshold);
    } else if (palette == PALETTE_INPUT_2BIT) {
        // 2-bit: 4 colors per channel
        result = quantizeWithDither(color.rgb, 4.0, ditherValue, threshold);
    } else {
        // Use palette-based dithering
        result = ditherWithPalette(color.rgb, ditherValue, threshold, palette);
    }
    
    // Blend between original input and dithered result
    result = mix(color.rgb, result, mixAmount);
    
    fragColor = vec4(result, color.a);
}
