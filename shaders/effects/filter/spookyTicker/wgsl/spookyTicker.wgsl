// Spooky ticker - scrolling bank_ocr digit rows at the bottom of the screen

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<uniform> time : f32;
@group(0) @binding(2) var<uniform> speed : f32;
@group(0) @binding(3) var<uniform> alpha : f32;
@group(0) @binding(4) var<uniform> rows : i32;
@group(0) @binding(5) var<uniform> seed : i32;

// Bank OCR bitmaps: 10 digits, 7 wide x 8 tall each
// Index as GLYPHS[digit * 8 + row], test bit (val >> (6 - col)) & 1
const GLYPHS = array<i32, 80>(
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

const GLYPH_W : i32 = 7;
const GLYPH_H : i32 = 8;
const SCALE : i32 = 3;
const CELL_W : i32 = 21;  // GLYPH_W * SCALE
const CELL_H : i32 = 24;  // GLYPH_H * SCALE
const ROW_GAP : i32 = 4;

fn hash_mix(v : u32) -> u32 {
    var r = v;
    r = r ^ (r >> 16u);
    r = r * 0x7feb352du;
    r = r ^ (r >> 15u);
    r = r * 0x846ca68bu;
    r = r ^ (r >> 16u);
    return r;
}

fn sample_glyph(digit : i32, localX : i32, localY : i32) -> f32 {
    let gx = localX / SCALE;
    let gy = localY / SCALE;
    if (gx < 0 || gx >= GLYPH_W || gy < 0 || gy >= GLYPH_H) {
        return 0.0;
    }
    let row = GLYPHS[digit * 8 + gy];
    return f32((row >> (6 - gx)) & 1);
}

fn ticker_row_mask(pixelX : i32, pixelY : i32, rowSeed : i32, t : f32) -> f32 {
    let scrollSpeed = 0.5 + f32(hash_mix(u32(rowSeed) ^ 17u) & 0xFFFFu) / 65535.0 * 1.5;
    let offset = i32(floor(t * scrollSpeed * 120.0));

    let sx = pixelX + offset;
    var cellX : i32;
    if (sx >= 0) {
        cellX = sx / CELL_W;
    } else {
        cellX = (sx - CELL_W + 1) / CELL_W;
    }
    let localX = sx - cellX * CELL_W;

    let h = hash_mix(u32(cellX) ^ u32(rowSeed) * 997u);
    let digit = i32(h % 10u);

    return sample_glyph(digit, localX, pixelY);
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;
    let src = textureLoad(inputTex, vec2<i32>(position.xy), 0);

    let t = time * speed;
    let baseSeed = hash_mix(u32(seed) * 7919u);

    let totalH = rows * (CELL_H + ROW_GAP);

    let px = i32(floor(uv.x * dims.x));
    let pyFromBottom = i32(floor((1.0 - uv.y) * dims.y));

    if (pyFromBottom >= totalH) {
        return src;
    }

    let rowStride = CELL_H + ROW_GAP;
    let rowIdx = pyFromBottom / rowStride;
    let localY = pyFromBottom - rowIdx * rowStride;

    if (rowIdx >= rows || localY >= CELL_H) {
        return src;
    }

    let rowSeed = i32(hash_mix(u32(rowIdx) + baseSeed));

    let mask = ticker_row_mask(px, localY, rowSeed, t);

    var shadow = 0.0;
    let shadowLocalY = localY + 2;
    if (shadowLocalY < CELL_H) {
        shadow = ticker_row_mask(px + 2, shadowLocalY, rowSeed, t);
    }

    var result = src.rgb;
    result = result * (1.0 - shadow * 0.4 * alpha);
    result = max(result, vec3<f32>(mask) * alpha);

    return vec4<f32>(clamp(result, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
