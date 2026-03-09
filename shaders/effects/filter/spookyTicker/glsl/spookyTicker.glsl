#version 300 es

precision highp float;
precision highp int;

// Spooky ticker - procedural scrolling pseudo-text at the bottom of the screen

uniform sampler2D inputTex;
uniform float time;
uniform float speed;
uniform float alpha;
uniform int rows;
uniform int seed;

in vec2 v_texCoord;
out vec4 fragColor;

const float INV_U32_MAX = 1.0 / 4294967295.0;

uint hash_mix(uint v) {
    v = v ^ (v >> 16u);
    v = v * 0x7feb352du;
    v = v ^ (v >> 15u);
    v = v * 0x846ca68bu;
    v = v ^ (v >> 16u);
    return v;
}

float random_float(uint s, uint salt) {
    return float(hash_mix(s ^ salt)) * INV_U32_MAX;
}

// 3x5 binary glyph pattern from hash
float glyph_pixel(vec2 cellUV, uint glyphSeed) {
    // 3 columns x 5 rows within each glyph cell
    int col = int(floor(cellUV.x * 3.0));
    int row = int(floor(cellUV.y * 5.0));
    if (col < 0 || col >= 3 || row < 0 || row >= 5) return 0.0;

    // Each of 15 bits is on/off
    uint bitIndex = uint(row * 3 + col);
    uint pattern = hash_mix(glyphSeed);
    float on = float((pattern >> bitIndex) & 1u);

    // Add thin gap between pixels for segment look
    vec2 local = fract(vec2(cellUV.x * 3.0, cellUV.y * 5.0));
    float gap = step(0.15, local.x) * step(local.x, 0.85) *
                step(0.15, local.y) * step(local.y, 0.85);

    return on * gap;
}

// Generate ticker row pattern
float ticker_row(float pixelX, float cellY, float rowSeedF, float t) {
    // Horizontal scroll speed varies per row
    float scrollSpeed = 0.5 + random_float(uint(rowSeedF), 17u) * 1.5;
    float scrollX = pixelX + t * scrollSpeed * 60.0;

    // Glyph cell width in pixels (5-12)
    float glyphWidth = 5.0 + floor(random_float(uint(rowSeedF), 23u) * 8.0);

    // Which glyph cell
    float glyphIndex = floor(scrollX / glyphWidth);
    float localX = mod(scrollX, glyphWidth) / glyphWidth;

    // Glyph seed from index + row
    uint glyphSeed = hash_mix(uint(glyphIndex) + uint(rowSeedF) * 1000u);

    // Periodic change: glyphs update every few seconds
    uint changePeriod = uint(floor(t * 0.5));
    glyphSeed = hash_mix(glyphSeed + changePeriod);

    // Flickering: some glyphs randomly off
    float flicker = step(0.25, random_float(glyphSeed, uint(floor(t * 8.0))));

    return glyph_pixel(vec2(localX, cellY), glyphSeed) * flicker;
}

void main() {
    vec2 dims = vec2(textureSize(inputTex, 0));
    vec4 src = texture(inputTex, v_texCoord);

    float t = time * speed;
    uint baseSeed = hash_mix(uint(seed) * 7919u);

    // Rows occupy the bottom of the screen, each ~4% of height
    float rowHeightFrac = 0.04;
    float rowGap = 0.005;
    float totalHeight = float(rows) * (rowHeightFrac + rowGap);

    // Y position from bottom
    float yFromBottom = 1.0 - v_texCoord.y;

    // Check if we're in the ticker region
    if (yFromBottom > totalHeight) {
        fragColor = src;
        return;
    }

    // Which row (0 = bottommost)
    float rowSlot = yFromBottom / (rowHeightFrac + rowGap);
    int rowIdx = int(floor(rowSlot));
    float inRowY = fract(rowSlot) * (rowHeightFrac + rowGap);

    // Skip gap region
    if (inRowY > rowHeightFrac || rowIdx >= rows) {
        fragColor = src;
        return;
    }

    float cellY = inRowY / rowHeightFrac;
    float rowSeedF = float(hash_mix(uint(rowIdx) + baseSeed));

    // Main pattern
    float mask = ticker_row(v_texCoord.x * dims.x, cellY, rowSeedF, t);

    // Shadow: offset by 1-2 pixels
    vec2 shadowOff = vec2(-1.5, 1.5) / dims;
    float shadowCellY = (inRowY - shadowOff.y * (rowHeightFrac * dims.y)) / rowHeightFrac;
    float shadowMask = ticker_row((v_texCoord.x + shadowOff.x) * dims.x, shadowCellY, rowSeedF, t);

    // Blending
    vec3 result = src.rgb;

    // Shadow: darken behind text
    result = mix(result, result * (1.0 - shadowMask * 0.5), alpha * 0.5);

    // Screen blend: lighten with glyph pattern
    result = mix(result, max(result, vec3(mask)), alpha);

    fragColor = vec4(clamp(result, 0.0, 1.0), src.a);
}
