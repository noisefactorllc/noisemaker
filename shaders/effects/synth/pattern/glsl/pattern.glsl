#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float aspect;
uniform int patternType;
uniform float scale;
uniform float thickness;
uniform float smoothness;
uniform float rotation;
uniform vec3 fgColor;
uniform vec3 bgColor;

out vec4 fragColor;

#define PI 3.14159265359
#define SQRT3 1.7320508075688772

// Pattern type constants
#define STRIPES 0
#define CHECKERBOARD 1
#define GRID 2
#define DOTS 3
#define HEXAGONS 4
#define DIAMONDS 5

// Rotate a 2D point
vec2 rotate2D(vec2 p, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Stripes pattern
float stripes(vec2 p, float t) {
    float stripe = fract(p.x);
    // Apply smoothness to both edges of the stripe
    float edge1 = smoothstep(0.5 - t * 0.5 - smoothness, 0.5 - t * 0.5 + smoothness, stripe);
    float edge2 = smoothstep(0.5 + t * 0.5 - smoothness, 0.5 + t * 0.5 + smoothness, stripe);
    return edge1 - edge2;
}

// Checkerboard pattern
float checkerboard(vec2 p, float sm) {
    vec2 f = fract(p);
    // Distance to nearest cell edge
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    // Determine which cell we're in
    vec2 cell = floor(p);
    float check = mod(cell.x + cell.y, 2.0);
    // Apply smoothness at edges
    float edge = smoothstep(0.0, sm * 0.5, d);
    return mix(1.0 - check, check, edge);
}

// Grid pattern (lines forming a grid)
float grid(vec2 p, float t) {
    vec2 f = fract(p);
    float lineX = smoothstep(t * 0.5 - smoothness, t * 0.5 + smoothness, abs(f.x - 0.5));
    float lineY = smoothstep(t * 0.5 - smoothness, t * 0.5 + smoothness, abs(f.y - 0.5));
    return 1.0 - min(lineX, lineY);
}

// Dots pattern (circles on a grid)
float dots(vec2 p, float t) {
    vec2 f = fract(p) - 0.5;
    float d = length(f);
    float radius = t * 0.5;
    return 1.0 - smoothstep(radius - smoothness, radius + smoothness, d);
}

// Hexagon distance function
float hexDist(vec2 p) {
    p = abs(p);
    return max(p.x * 0.5 + p.y * (SQRT3 / 2.0), p.x);
}

// Hexagons pattern
float hexagons(vec2 p, float t) {
    // Scale for hexagonal grid
    vec2 s = vec2(1.0, SQRT3);
    vec2 h = s * 0.5;
    
    // Two offset grids
    vec2 a = mod(p, s) - h;
    vec2 b = mod(p + h, s) - h;
    
    // Choose closest hexagon center
    vec2 g = length(a) < length(b) ? a : b;
    
    float d = hexDist(g);
    float edge = 0.5 * t;
    return smoothstep(edge + smoothness, edge - smoothness, d);
}

// Diamonds pattern (herringbone-style angled bricks)
float diamonds(vec2 p, float t) {
    // Determine which diagonal band we're in
    float band = floor(p.x + p.y);
    float dir = mod(band, 2.0);
    
    // Rotate coordinates based on band direction
    vec2 rp = dir > 0.5 ? vec2(p.x - p.y, p.x + p.y) : vec2(p.x + p.y, p.y - p.x);
    rp *= 0.25;  // Even larger scale
    
    vec2 f = fract(rp * 2.0);
    
    // Create brick pattern in rotated space - invert thickness so larger t = larger bricks
    float gap = (1.0 - t) * 0.4;  // Gap size decreases as thickness increases
    float lineX = smoothstep(gap - smoothness, gap + smoothness, abs(f.x - 0.5));
    float lineY = smoothstep(gap - smoothness, gap + smoothness, abs(f.y - 0.5));
    
    return lineX * lineY;
}

void main() {
    // Normalize coordinates
    vec2 st = gl_FragCoord.xy / resolution;
    st = (st - 0.5) * 2.0;
    st.x *= aspect;
    
    // Apply rotation
    float rad = rotation * PI / 180.0;
    st = rotate2D(st, rad);
    
    // Apply scale
    vec2 p = st * scale;
    
    // Compute pattern value
    float m = 0.0;
    
    if (patternType == STRIPES) {
        m = stripes(p, thickness);
    } else if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == GRID) {
        m = grid(p, thickness);
    } else if (patternType == DOTS) {
        m = dots(p, thickness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness);
    } else if (patternType == DIAMONDS) {
        m = diamonds(p, thickness);
    }
    
    // Mix colors
    vec3 color = mix(bgColor, fgColor, m);
    
    fragColor = vec4(color, 1.0);
}
