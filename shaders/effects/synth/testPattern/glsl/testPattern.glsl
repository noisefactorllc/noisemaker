#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform int gridSize;
uniform int pattern;

out vec4 fragColor;

// 3x5 pixel font for digits 0-9
// Each digit is encoded as 15 bits (3 columns x 5 rows, row-major)
const int GLYPH[10] = int[10](
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
bool sampleGlyph(int digit, int x, int y) {
    if (digit < 0 || digit > 9 || x < 0 || x > 2 || y < 0 || y > 4) return false;
    int bitIndex = y * 3 + (2 - x);  // row-major, top-left origin
    return ((GLYPH[digit] >> bitIndex) & 1) == 1;
}

// Render a number at a position within a cell
bool renderNumber(int number, vec2 cellUV) {
    // Determine how many digits we need
    int numDigits = 1;
    if (number >= 10) numDigits = 2;
    if (number >= 100) numDigits = 3;

    // Glyph dimensions in UV space (centered, scaled to fit nicely)
    float glyphWidth = 0.15;
    float glyphHeight = 0.35;
    float spacing = 0.05;

    float totalWidth = float(numDigits) * glyphWidth + float(numDigits - 1) * spacing;
    float startX = 0.5 - totalWidth * 0.5;
    float startY = 0.5 - glyphHeight * 0.5;

    // Check if we're in the vertical range for glyphs
    if (cellUV.y < startY || cellUV.y >= startY + glyphHeight) return false;

    // Extract digits (right to left)
    int digits[3];
    int temp = number;
    for (int i = 0; i < 3; i++) {
        digits[i] = temp % 10;
        temp /= 10;
    }

    // Check each digit position (left to right)
    for (int d = 0; d < numDigits; d++) {
        float digitX = startX + float(d) * (glyphWidth + spacing);

        if (cellUV.x >= digitX && cellUV.x < digitX + glyphWidth) {
            // We're in this digit's horizontal range
            float localX = (cellUV.x - digitX) / glyphWidth;
            float localY = (cellUV.y - startY) / glyphHeight;

            // Map to 3x5 grid
            int gx = int(localX * 3.0);
            int gy = int(localY * 5.0);

            // Get the correct digit (numDigits-1-d because digits[] is reversed)
            int digit = digits[numDigits - 1 - d];

            return sampleGlyph(digit, gx, gy);
        }
    }

    return false;
}

// Pattern 0: Numbered checkerboard
vec4 checkerboard(vec2 uv) {
    int n = max(gridSize, 1);
    int cellX = int(uv.x * float(n));
    int cellY = int(uv.y * float(n));

    int cellNum = (n - 1 - cellY) * n + cellX;

    bool isWhiteCell = ((cellX + cellY) % 2) == 0;

    vec2 cellUV = fract(uv * float(n));

    bool isGlyph = renderNumber(cellNum, cellUV);

    float cellColor = isWhiteCell ? 1.0 : 0.0;
    float glyphColor = isWhiteCell ? 0.0 : 1.0;
    float finalColor = isGlyph ? glyphColor : cellColor;

    return vec4(vec3(finalColor), 1.0);
}

// Pattern 1: 8 vertical SMPTE-style color bars
vec4 colorBars(vec2 uv) {
    int bar = int(uv.x * 8.0);
    bar = clamp(bar, 0, 7);

    // white, yellow, cyan, green, magenta, red, blue, black
    vec3 colors[8] = vec3[8](
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 1.0, 0.0),
        vec3(0.0, 1.0, 1.0),
        vec3(0.0, 1.0, 0.0),
        vec3(1.0, 0.0, 1.0),
        vec3(1.0, 0.0, 0.0),
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 0.0, 0.0)
    );

    return vec4(colors[bar], 1.0);
}

// Pattern 2: Horizontal black-to-white gradient ramp
vec4 gradient(vec2 uv) {
    return vec4(vec3(uv.x), 1.0);
}

// Pattern 3: UV map (R=u, G=v, B=0)
vec4 uvMap(vec2 uv) {
    return vec4(uv.x, uv.y, 0.0, 1.0);
}

// Pattern 4: Thin white grid lines on black
vec4 gridLines(vec2 uv) {
    int n = max(gridSize, 1);
    vec2 cellUV = fract(uv * float(n));
    vec2 edge = min(cellUV, 1.0 - cellUV);
    vec2 fw = fwidth(uv * float(n));
    float line = 1.0 - smoothstep(0.0, 1.5 * fw.x, edge.x) * smoothstep(0.0, 1.5 * fw.y, edge.y);
    return vec4(vec3(line), 1.0);
}

// HSV to RGB (hue only, full saturation & value)
vec3 hue2rgb(float h) {
    float r = abs(h * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(h * 6.0 - 2.0);
    float b = 2.0 - abs(h * 6.0 - 4.0);
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// Pattern 5: Each cell gets a unique hue
vec4 colorGrid(vec2 uv) {
    int n = max(gridSize, 1);
    int cellX = int(uv.x * float(n));
    int cellY = int(uv.y * float(n));
    int cellIndex = cellY * n + cellX;
    float hue = fract(float(cellIndex) * 0.618033988749895);
    return vec4(hue2rgb(hue), 1.0);
}

// Pattern 6: Filled circle at each grid intersection
vec4 dotGrid(vec2 uv) {
    int n = max(gridSize, 1);
    vec2 scaled = uv * float(n);
    vec2 nearest = round(scaled);
    float dist = length(scaled - nearest);
    float dot = 1.0 - smoothstep(0.12, 0.15, dist);
    return vec4(vec3(dot), 1.0);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;

    if (pattern == 1) {
        fragColor = colorBars(uv);
    } else if (pattern == 2) {
        fragColor = gradient(uv);
    } else if (pattern == 3) {
        fragColor = uvMap(uv);
    } else if (pattern == 4) {
        fragColor = gridLines(uv);
    } else if (pattern == 5) {
        fragColor = colorGrid(uv);
    } else if (pattern == 6) {
        fragColor = dotGrid(uv);
    } else {
        fragColor = checkerboard(uv);
    }
}
