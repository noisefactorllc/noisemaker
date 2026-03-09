// Spooky ticker - procedural scrolling pseudo-text at the bottom of the screen

const INV_U32_MAX : f32 = 1.0 / 4294967295.0;

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<uniform> time : f32;
@group(0) @binding(2) var<uniform> speed : f32;
@group(0) @binding(3) var<uniform> alpha : f32;
@group(0) @binding(4) var<uniform> rows : i32;
@group(0) @binding(5) var<uniform> seed : i32;

fn hash_mix(v : u32) -> u32 {
    var result = v;
    result = result ^ (result >> 16u);
    result = result * 0x7feb352du;
    result = result ^ (result >> 15u);
    result = result * 0x846ca68bu;
    result = result ^ (result >> 16u);
    return result;
}

fn random_float(s : u32, salt : u32) -> f32 {
    return f32(hash_mix(s ^ salt)) * INV_U32_MAX;
}

// 3x5 binary glyph pattern from hash
fn glyph_pixel(cellUV : vec2<f32>, glyphSeed : u32) -> f32 {
    let col = i32(floor(cellUV.x * 3.0));
    let row = i32(floor(cellUV.y * 5.0));
    if (col < 0 || col >= 3 || row < 0 || row >= 5) {
        return 0.0;
    }

    let bitIndex = u32(row * 3 + col);
    let pattern = hash_mix(glyphSeed);
    let on = f32((pattern >> bitIndex) & 1u);

    let local = fract(vec2<f32>(cellUV.x * 3.0, cellUV.y * 5.0));
    let gap = step(0.15, local.x) * step(local.x, 0.85) *
              step(0.15, local.y) * step(local.y, 0.85);

    return on * gap;
}

// Generate ticker row pattern
fn ticker_row(pixelX : f32, cellY : f32, rowSeedF : f32, t : f32) -> f32 {
    let scrollSpeed = 0.5 + random_float(u32(rowSeedF), 17u) * 1.5;
    let scrollX = pixelX + t * scrollSpeed * 60.0;

    let glyphWidth = 5.0 + floor(random_float(u32(rowSeedF), 23u) * 8.0);

    let glyphIndex = floor(scrollX / glyphWidth);
    let localX = (scrollX % glyphWidth) / glyphWidth;

    var glyphSeed = hash_mix(u32(glyphIndex) + u32(rowSeedF) * 1000u);

    let changePeriod = u32(floor(t * 0.5));
    glyphSeed = hash_mix(glyphSeed + changePeriod);

    let flicker = step(0.25, random_float(glyphSeed, u32(floor(t * 8.0))));

    return glyph_pixel(vec2<f32>(localX, cellY), glyphSeed) * flicker;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;
    let src = textureLoad(inputTex, vec2<i32>(position.xy), 0);

    let t = time * speed;
    let baseSeed = hash_mix(u32(seed) * 7919u);

    let rowHeightFrac = 0.04;
    let rowGap = 0.005;
    let totalHeight = f32(rows) * (rowHeightFrac + rowGap);

    let yFromBottom = 1.0 - uv.y;

    if (yFromBottom > totalHeight) {
        return src;
    }

    let rowSlot = yFromBottom / (rowHeightFrac + rowGap);
    let rowIdx = i32(floor(rowSlot));
    let inRowY = fract(rowSlot) * (rowHeightFrac + rowGap);

    if (inRowY > rowHeightFrac || rowIdx >= rows) {
        return src;
    }

    let cellY = inRowY / rowHeightFrac;
    let rowSeedF = f32(hash_mix(u32(rowIdx) + baseSeed));

    let mask = ticker_row(uv.x * dims.x, cellY, rowSeedF, t);

    let shadowOff = vec2<f32>(-1.5, 1.5) / dims;
    let shadowCellY = (inRowY - shadowOff.y * (rowHeightFrac * dims.y)) / rowHeightFrac;
    let shadowMask = ticker_row((uv.x + shadowOff.x) * dims.x, shadowCellY, rowSeedF, t);

    var result = src.rgb;

    result = mix(result, result * (1.0 - shadowMask * 0.5), alpha * 0.5);
    result = mix(result, max(result, vec3<f32>(mask)), alpha);

    return vec4<f32>(clamp(result, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}
