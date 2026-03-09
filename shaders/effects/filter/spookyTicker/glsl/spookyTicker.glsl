#version 300 es

precision highp float;
precision highp int;

// Spooky ticker - scrolling bank_ocr digit rows at the bottom of the screen

uniform sampler2D inputTex;
uniform float time;
uniform float speed;
uniform float alpha;
uniform int rows;
uniform int seed;

in vec2 v_texCoord;
out vec4 fragColor;

// Bank OCR bitmaps: 10 digits, 7 wide x 8 tall each
// Index as GLYPHS[digit * 8 + row], test bit (val >> (6 - col)) & 1
const int GLYPHS[80] = int[80](
    // Digit 0
    0x3C, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3C, 0x00,
    // Digit 1
    0x18, 0x08, 0x08, 0x08, 0x1C, 0x1C, 0x1C, 0x00,
    // Digit 2
    0x1C, 0x04, 0x04, 0x1C, 0x10, 0x10, 0x1C, 0x00,
    // Digit 3
    0x1C, 0x04, 0x04, 0x1C, 0x06, 0x06, 0x1E, 0x00,
    // Digit 4
    0x60, 0x60, 0x60, 0x60, 0x66, 0x7E, 0x06, 0x00,
    // Digit 5
    0x3C, 0x20, 0x20, 0x3C, 0x04, 0x04, 0x3C, 0x00,
    // Digit 6
    0x78, 0x48, 0x40, 0x40, 0x7E, 0x42, 0x7E, 0x00,
    // Digit 7
    0x3C, 0x24, 0x04, 0x0C, 0x08, 0x08, 0x08, 0x00,
    // Digit 8
    0x3C, 0x24, 0x24, 0x7E, 0x66, 0x66, 0x7E, 0x00,
    // Digit 9
    0x3E, 0x22, 0x22, 0x3E, 0x06, 0x06, 0x06, 0x00
);

const int GLYPH_W = 7;
const int GLYPH_H = 8;
const int SCALE = 3;
const int CELL_W = GLYPH_W * SCALE;  // 21 pixels
const int CELL_H = GLYPH_H * SCALE;  // 24 pixels
const int ROW_GAP = 4;

uint hash_mix(uint v) {
    v = v ^ (v >> 16u);
    v = v * 0x7feb352du;
    v = v ^ (v >> 15u);
    v = v * 0x846ca68bu;
    v = v ^ (v >> 16u);
    return v;
}

// Sample the bitmap for a given digit at pixel-local coords
float sample_glyph(int digit, int localX, int localY) {
    // Scale down to glyph coords
    int gx = localX / SCALE;
    int gy = localY / SCALE;
    if (gx < 0 || gx >= GLYPH_W || gy < 0 || gy >= GLYPH_H) return 0.0;
    int row = GLYPHS[digit * 8 + gy];
    return float((row >> (6 - gx)) & 1);
}

// Get the ticker mask value at a given pixel position for one row
float ticker_row_mask(int pixelX, int pixelY, int rowSeed, float t) {
    // Scroll offset in pixels
    float scrollSpeed = 0.5 + float(hash_mix(uint(rowSeed) ^ 17u) & 0xFFFFu) / 65535.0 * 1.5;
    int offset = int(floor(t * scrollSpeed * 60.0));

    int sx = pixelX + offset;
    // Handle negative modulo
    int cellX = sx >= 0 ? sx / CELL_W : (sx - CELL_W + 1) / CELL_W;
    int localX = sx - cellX * CELL_W;

    // Which digit for this cell
    uint h = hash_mix(uint(cellX) ^ uint(rowSeed) * 997u);
    int digit = int(h % 10u);

    return sample_glyph(digit, localX, pixelY);
}

void main() {
    vec2 dims = vec2(textureSize(inputTex, 0));
    vec4 src = texture(inputTex, v_texCoord);

    float t = time * speed;
    uint baseSeed = hash_mix(uint(seed) * 7919u);

    // Total height of ticker region in pixels
    int totalH = rows * (CELL_H + ROW_GAP);

    // Pixel coords from bottom-left
    int px = int(floor(v_texCoord.x * dims.x));
    int pyFromBottom = int(floor((1.0 - v_texCoord.y) * dims.y));

    if (pyFromBottom >= totalH) {
        fragColor = src;
        return;
    }

    // Which row and local Y within it
    int rowStride = CELL_H + ROW_GAP;
    int rowIdx = pyFromBottom / rowStride;
    int localY = pyFromBottom - rowIdx * rowStride;

    if (rowIdx >= rows || localY >= CELL_H) {
        fragColor = src;
        return;
    }

    int rowSeed = int(hash_mix(uint(rowIdx) + baseSeed));

    // Main glyph
    float mask = ticker_row_mask(px, localY, rowSeed, t);

    // Shadow: sample at offset (+2, +2) pixels — shifted right and down
    float shadow = 0.0;
    int shadowLocalY = localY + 2;
    if (shadowLocalY < CELL_H) {
        shadow = ticker_row_mask(px + 2, shadowLocalY, rowSeed, t);
    }

    // Composite
    vec3 result = src.rgb;
    // Shadow darkens
    result = result * (1.0 - shadow * 0.4 * alpha);
    // Glyph brightens (screen blend)
    result = max(result, vec3(mask) * alpha);

    fragColor = vec4(clamp(result, 0.0, 1.0), src.a);
}
