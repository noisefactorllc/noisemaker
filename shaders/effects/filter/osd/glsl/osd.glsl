#version 300 es

precision highp float;
precision highp int;

// OSD: Procedural on-screen display overlay.
// Renders hash-based pseudo-glyph block patterns at bottom-right,
// matching the spirit of the Python on_screen_display effect.

const float TAU = 6.283185307179586;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float alpha;
uniform float seed;
uniform float speed;
uniform float time;

layout(location = 0) out vec4 fragColor;

// Grid dimensions for each pseudo-glyph
const int GLYPH_COLS = 3;
const int GLYPH_ROWS = 5;

uint pcg(uint v_in) {
    uint state = v_in * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

uint hash2(uint a, uint b) {
    return pcg(a ^ (b * 0x9e3779b9u + 0x632be59bu));
}

uint hash3(uint a, uint b, uint c) {
    return pcg(hash2(a, b) ^ (c * 0x94d049bbu + 0x5bf03635u));
}

// Determine if a cell (row, col) in a glyph is "on"
// Uses seed + glyph index to produce a deterministic 3x5 binary pattern
// that looks like a seven-segment style readout character
float glyph_cell(uint glyph_seed, int row, int col) {
    // Hash the glyph seed with row and col
    uint h = hash3(glyph_seed, uint(row), uint(col));
    // Use different thresholds for edges vs interior to get segment-like shapes
    // Top/bottom rows and left/right cols are more likely to be on (frame)
    bool is_edge_row = (row == 0 || row == 2 || row == GLYPH_ROWS - 1);
    bool is_edge_col = (col == 0 || col == GLYPH_COLS - 1);
    float threshold;
    if (is_edge_row && !is_edge_col) {
        // Horizontal segments
        threshold = 0.45;
    } else if (is_edge_col && !is_edge_row) {
        // Vertical segments
        threshold = 0.55;
    } else if (is_edge_row && is_edge_col) {
        // Corners - less likely
        threshold = 0.7;
    } else {
        // Interior - rarely on
        threshold = 0.85;
    }
    float val = float(h) / 4294967296.0;
    return val < threshold ? 1.0 : 0.0;
}

// Get the glyph index for a given cell position, animated by time
uint get_glyph_seed(uint base_seed, int glyph_index, float time_value, float speed_value) {
    float angle = TAU * time_value;
    float z = cos(angle) * speed_value;
    // Quantize z to get discrete glyph changes
    int z_cell = int(floor(z));
    return hash3(base_seed, uint(glyph_index), uint(z_cell));
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 texDims = textureSize(inputTex, 0);
    int width = max(texDims.x, 1);
    int height = max(texDims.y, 1);

    vec4 texel = texelFetch(inputTex, coord, 0);

    float blend_alpha = clamp(alpha, 0.0, 1.0);
    if (blend_alpha <= 0.0) {
        fragColor = texel;
        return;
    }

    uint base_seed = uint(max(seed, 1.0));

    // Determine glyph count (3-6) from seed
    int glyph_count = 3 + int(hash2(base_seed, 42u) % 4u);

    // Scale: each glyph pixel is scale x scale screen pixels
    int base_segment = width / 24;
    if (base_segment < GLYPH_COLS) {
        fragColor = texel;
        return;
    }
    int scale = max(base_segment / GLYPH_COLS, 1);

    int glyph_pixel_w = GLYPH_COLS * scale;
    int glyph_pixel_h = GLYPH_ROWS * scale;
    int gap = scale; // 1-pixel-scaled gap between glyphs
    int overlay_w = glyph_count * glyph_pixel_w + (glyph_count - 1) * gap;
    int overlay_h = glyph_pixel_h;
    int padding = 25;

    // Position: bottom-right with padding
    int origin_x = width - overlay_w - padding;
    int origin_y = height - overlay_h - padding;
    if (origin_x < 0) origin_x = 0;
    if (origin_y < 0) origin_y = 0;

    // Check if pixel is in OSD region
    int lx = coord.x - origin_x;
    int ly = coord.y - origin_y;
    if (lx < 0 || lx >= overlay_w || ly < 0 || ly >= overlay_h) {
        fragColor = texel;
        return;
    }

    // Determine which glyph and which cell within it
    int cell_stride = glyph_pixel_w + gap;
    int glyph_idx = lx / cell_stride;
    int within_glyph_x = lx - glyph_idx * cell_stride;

    // If in the gap between glyphs, pass through
    if (within_glyph_x >= glyph_pixel_w || glyph_idx >= glyph_count) {
        fragColor = texel;
        return;
    }

    int cell_col = within_glyph_x / scale;
    int cell_row_raw = ly / scale;
    // Flip vertically so row 0 is bottom (screen y increases downward)
    int cell_row = (GLYPH_ROWS - 1) - cell_row_raw;

    if (cell_col < 0 || cell_col >= GLYPH_COLS || cell_row < 0 || cell_row >= GLYPH_ROWS) {
        fragColor = texel;
        return;
    }

    uint glyph_seed = get_glyph_seed(base_seed, glyph_idx, time, speed);
    float cell_on = glyph_cell(glyph_seed, cell_row, cell_col);

    if (cell_on < 0.5) {
        fragColor = texel;
        return;
    }

    // Blend: mix(input, max(glyph, input), alpha)
    vec3 highlight = max(texel.rgb, vec3(cell_on));
    vec3 blended = mix(texel.rgb, highlight, blend_alpha);
    fragColor = vec4(clamp(blended, 0.0, 1.0), texel.a);
}
