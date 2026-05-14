// WGSL version – WebGPU

struct Uniforms {
    resolution: vec2f,
    gridSize: i32,
    pattern: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// 3x5 pixel font for digits 0-9
// Each digit is encoded as 15 bits (3 columns x 5 rows, row-major)
const GLYPH = array<i32, 10>(
    0x7B6F,  // 0: 111 101 101 101 111
    0x2492,  // 1: 010 010 010 010 010
    0x73E7,  // 2: 111 001 111 100 111
    0x72CF,  // 3: 111 001 011 001 111
    0x5BC9,  // 4: 101 101 111 001 001
    0x79CF,  // 5: 111 100 111 001 111
    0x79EF,  // 6: 111 100 111 101 111
    0x7249,  // 7: 111 001 001 001 001
    0x7BEF,  // 8: 111 101 111 101 111
    0x7BCF   // 9: 111 101 111 001 111
);

// Sample a glyph at local coordinates (0-2, 0-4)
fn sampleGlyph(digit: i32, x: i32, y: i32) -> bool {
    if (digit < 0 || digit > 9 || x < 0 || x > 2 || y < 0 || y > 4) {
        return false;
    }
    let bitIndex = y * 3 + (2 - x);  // row-major, top-left origin
    return ((GLYPH[digit] >> u32(bitIndex)) & 1) == 1;
}

// Render a number at a position within a cell
fn renderNumber(number: i32, cellUV: vec2f) -> bool {
    // Determine how many digits we need
    var numDigits = 1;
    if (number >= 10) { numDigits = 2; }
    if (number >= 100) { numDigits = 3; }

    // Glyph dimensions in UV space (centered, scaled to fit nicely)
    let glyphWidth = 0.15;
    let glyphHeight = 0.35;
    let spacing = 0.05;

    let totalWidth = f32(numDigits) * glyphWidth + f32(numDigits - 1) * spacing;
    let startX = 0.5 - totalWidth * 0.5;
    let startY = 0.5 - glyphHeight * 0.5;

    // Check if we're in the vertical range for glyphs
    if (cellUV.y < startY || cellUV.y >= startY + glyphHeight) {
        return false;
    }

    // Extract digits (right to left)
    var digits = array<i32, 3>(0, 0, 0);
    var temp = number;
    for (var i = 0; i < 3; i++) {
        digits[i] = temp % 10;
        temp = temp / 10;
    }

    // Check each digit position (left to right)
    for (var d = 0; d < numDigits; d++) {
        let digitX = startX + f32(d) * (glyphWidth + spacing);

        if (cellUV.x >= digitX && cellUV.x < digitX + glyphWidth) {
            // We're in this digit's horizontal range
            let localX = (cellUV.x - digitX) / glyphWidth;
            let localY = (cellUV.y - startY) / glyphHeight;

            // Map to 3x5 grid
            let gx = i32(localX * 3.0);
            let gy = i32(localY * 5.0);

            // Get the correct digit (numDigits-1-d because digits[] is reversed)
            let digit = digits[numDigits - 1 - d];

            return sampleGlyph(digit, gx, gy);
        }
    }

    return false;
}

// Pattern 0: Numbered checkerboard
fn checkerboard(uv: vec2f) -> vec4f {
    let n = max(uniforms.gridSize, 1);
    let cellX = i32(uv.x * f32(n));
    let cellY = i32(uv.y * f32(n));

    let cellNum = (n - 1 - cellY) * n + cellX;

    let isWhiteCell = ((cellX + cellY) % 2) == 0;

    let cellUV = fract(uv * f32(n));

    let isGlyph = renderNumber(cellNum, cellUV);

    let cellColor = select(0.0, 1.0, isWhiteCell);
    let glyphColor = select(1.0, 0.0, isWhiteCell);
    let finalColor = select(cellColor, glyphColor, isGlyph);

    return vec4f(vec3f(finalColor), 1.0);
}

// Pattern 1: 8 vertical SMPTE-style color bars
fn colorBars(uv: vec2f) -> vec4f {
    var bar = i32(uv.x * 8.0);
    bar = clamp(bar, 0, 7);

    // white, yellow, cyan, green, magenta, red, blue, black
    let colors = array<vec3f, 8>(
        vec3f(1.0, 1.0, 1.0),
        vec3f(1.0, 1.0, 0.0),
        vec3f(0.0, 1.0, 1.0),
        vec3f(0.0, 1.0, 0.0),
        vec3f(1.0, 0.0, 1.0),
        vec3f(1.0, 0.0, 0.0),
        vec3f(0.0, 0.0, 1.0),
        vec3f(0.0, 0.0, 0.0)
    );

    return vec4f(colors[bar], 1.0);
}

// Pattern 2: Horizontal black-to-white gradient ramp
fn gradientRamp(uv: vec2f) -> vec4f {
    return vec4f(vec3f(uv.x), 1.0);
}

// Pattern 3: UV map (R=u, G=v, B=0)
fn uvMapPattern(uv: vec2f) -> vec4f {
    return vec4f(uv.x, uv.y, 0.0, 1.0);
}

// Pattern 4: Thin white grid lines on black
fn gridLines(uv: vec2f) -> vec4f {
    let n = max(uniforms.gridSize, 1);
    let cellUV = fract(uv * f32(n));
    let edge = min(cellUV, 1.0 - cellUV);
    let fw = fwidthFine(uv * f32(n));
    let line = 1.0 - smoothstep(0.0, 1.5 * fw.x, edge.x) * smoothstep(0.0, 1.5 * fw.y, edge.y);
    return vec4f(vec3f(line), 1.0);
}

// HSV to RGB (hue only, full saturation & value)
fn hue2rgb(h: f32) -> vec3f {
    let r = abs(h * 6.0 - 3.0) - 1.0;
    let g = 2.0 - abs(h * 6.0 - 2.0);
    let b = 2.0 - abs(h * 6.0 - 4.0);
    return clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0));
}

// Pattern 5: Each cell gets a unique hue
fn colorGrid(uv: vec2f) -> vec4f {
    let n = max(uniforms.gridSize, 1);
    let cellX = i32(uv.x * f32(n));
    let cellY = i32(uv.y * f32(n));
    let cellIndex = cellY * n + cellX;
    let hue = fract(f32(cellIndex) * 0.618033988749895);
    return vec4f(hue2rgb(hue), 1.0);
}

// Pattern 6: Filled circle at each grid intersection
fn dotGrid(uv: vec2f) -> vec4f {
    let n = max(uniforms.gridSize, 1);
    let scaled = uv * f32(n);
    let nearest = round(scaled);
    let dist = length(scaled - nearest);
    let d = 1.0 - smoothstep(0.12, 0.15, dist);
    return vec4f(vec3f(d), 1.0);
}

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let uv = position.xy / uniforms.resolution;

    if (uniforms.pattern == 1) {
        return colorBars(uv);
    } else if (uniforms.pattern == 2) {
        return gradientRamp(uv);
    } else if (uniforms.pattern == 3) {
        return uvMapPattern(uv);
    } else if (uniforms.pattern == 4) {
        return gridLines(uv);
    } else if (uniforms.pattern == 5) {
        return colorGrid(uv);
    } else if (uniforms.pattern == 6) {
        return dotGrid(uv);
    } else {
        return checkerboard(uv);
    }
}
