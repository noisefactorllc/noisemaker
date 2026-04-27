#version 300 es

precision highp float;
precision highp int;

// OSD: On-screen display overlay with bank_ocr digit bitmaps.
// Renders a small readout of 3-6 digits at the bottom-right corner,
// with time-cycling digit values and green/white OSD tint.

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float renderScale;
uniform float alpha;
uniform float seed;
uniform float speed;
uniform float time;
uniform int corner;

layout(location = 0) out vec4 fragColor;

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
const int BASE_SCALE = 3;
const int BASE_PADDING = 25;

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

// Sample the bitmap for a given digit at pixel-local coords
float sample_glyph(int digit, int localX, int localY, int iScale) {
    int gx = localX / iScale;
    int gy = localY / iScale;
    if (gx < 0 || gx >= GLYPH_W || gy < 0 || gy >= GLYPH_H) return 0.0;
    int row = GLYPHS[digit * 8 + gy];
    return float((row >> (6 - gx)) & 1);
}

void main() {
    // Scale all pixel-space sizes by renderScale for high-res export
    int iScale = max(int(float(BASE_SCALE) * renderScale), 1);
    int CELL_W = GLYPH_W * iScale;
    int CELL_H = GLYPH_H * iScale;
    int GAP = iScale;
    int PADDING = int(float(BASE_PADDING) * renderScale);

    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 texDims = textureSize(inputTex, 0);
    int width = max(texDims.x, 1);
    int height = max(texDims.y, 1);

    vec4 texel = texelFetch(inputTex, coord, 0);

    float blend_alpha = clamp(alpha, 0.0, 1.0);

    // Subtle scanline tint across entire image (OSD monitor feel)
    int scanlineStep = max(iScale / BASE_SCALE, 1);
    float scanline = 1.0 - 0.03 * blend_alpha * float((coord.y / scanlineStep) & 1);
    vec3 base_rgb = texel.rgb * scanline;

    if (blend_alpha <= 0.0) {
        fragColor = vec4(base_rgb, texel.a);
        return;
    }

    uint base_seed = uint(max(seed, 1.0));

    // Glyph count: 3-6 from seed
    int glyph_count = 3 + int(hash2(base_seed, 42u) % 4u);

    // Overlay dimensions
    int overlay_w = glyph_count * CELL_W + (glyph_count - 1) * GAP;
    int overlay_h = CELL_H;

    // Position based on corner (GL coords: y=0 is bottom)
    // 0=TL, 1=TR, 2=BL, 3=BR
    int origin_x;
    int origin_y;
    if (corner == 0) { // top-left
        origin_x = PADDING;
        origin_y = height - overlay_h - PADDING;
    } else if (corner == 1) { // top-right
        origin_x = width - overlay_w - PADDING;
        origin_y = height - overlay_h - PADDING;
    } else if (corner == 2) { // bottom-left
        origin_x = PADDING;
        origin_y = PADDING;
    } else { // bottom-right (default)
        origin_x = width - overlay_w - PADDING;
        origin_y = PADDING;
    }
    if (origin_x < 0) origin_x = 0;
    if (origin_y < 0) origin_y = 0;

    // Expand OSD region with padding for background panel
    int panel_pad = GAP * 2;
    int panel_x0 = origin_x - panel_pad;
    int panel_y0 = origin_y - panel_pad;
    int panel_x1 = origin_x + overlay_w + panel_pad;
    int panel_y1 = origin_y + overlay_h + panel_pad;

    // Outside panel region: just scanline
    if (coord.x < panel_x0 || coord.x >= panel_x1 || coord.y < panel_y0 || coord.y >= panel_y1) {
        fragColor = vec4(base_rgb, texel.a);
        return;
    }

    // Check if pixel is in OSD glyph region
    int lx = coord.x - origin_x;
    int ly = coord.y - origin_y;

    float mask = 0.0;
    if (lx >= 0 && lx < overlay_w && ly >= 0 && ly < overlay_h) {
        // Determine which glyph
        int cell_stride = CELL_W + GAP;
        int glyph_idx = lx / cell_stride;
        int within_glyph_x = lx - glyph_idx * cell_stride;

        if (within_glyph_x < CELL_W && glyph_idx < glyph_count) {
            // Local Y within glyph (flip so row 0 is top of glyph)
            int local_y = (CELL_H - 1) - ly;

            // Time-cycling digit selection
            int time_cell = int(floor(time * max(speed, 0.001)));
            uint digit_hash = hash3(base_seed, uint(glyph_idx), uint(time_cell));
            int digit = int(digit_hash % 10u);

            mask = sample_glyph(digit, within_glyph_x, local_y, iScale);
        }
    }

    // Dark background panel behind digits
    vec3 panel_bg = base_rgb * (1.0 - 0.5 * blend_alpha);

    if (mask < 0.5) {
        fragColor = vec4(clamp(panel_bg, 0.0, 1.0), texel.a);
        return;
    }

    // Green/white OSD tint
    vec3 osd_color = vec3(0.7, 1.0, 0.75);
    vec3 highlight = max(panel_bg, osd_color * mask);
    vec3 blended = mix(panel_bg, highlight, blend_alpha);
    fragColor = vec4(clamp(blended, 0.0, 1.0), texel.a);
}
