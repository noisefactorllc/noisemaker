#version 300 es
precision highp float;

uniform vec2 resolution;
uniform int gridSize;

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

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // Calculate which cell we're in
    int n = max(gridSize, 1);
    int cellX = int(uv.x * float(n));
    int cellY = int(uv.y * float(n));
    
    // Cell number (top-left is 0, row-major order)
    int cellNum = (n - 1 - cellY) * n + cellX;
    
    // Checkerboard pattern
    bool isWhiteCell = ((cellX + cellY) % 2) == 0;
    
    // Local UV within cell
    vec2 cellUV = fract(uv * float(n));
    
    // Check if we should draw a glyph pixel
    bool isGlyph = renderNumber(cellNum, cellUV);
    
    // Final color: glyph is inverse of cell color
    float cellColor = isWhiteCell ? 1.0 : 0.0;
    float glyphColor = isWhiteCell ? 0.0 : 1.0;
    
    float finalColor = isGlyph ? glyphColor : cellColor;
    
    fragColor = vec4(vec3(finalColor), 1.0);
}
