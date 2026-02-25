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
#define TAU 6.28318530718
#define SQRT3 1.7320508075688772

// Pattern type constants
#define CHECKERBOARD 0
#define CONCENTRIC_RINGS 1
#define DOTS 2
#define GRID 3
#define HEXAGONS 4
#define RADIAL_LINES 5
#define SPIRAL 6
#define STRIPES 7
#define TRIANGULAR_GRID 8

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

// Concentric rings pattern
float concentricRings(vec2 p, float t) {
    float d = fract(length(p));
    float edge1 = smoothstep(0.5 - t * 0.5 - smoothness, 0.5 - t * 0.5 + smoothness, d);
    float edge2 = smoothstep(0.5 + t * 0.5 - smoothness, 0.5 + t * 0.5 + smoothness, d);
    return edge1 - edge2;
}

// Radial lines pattern
float radialLines(vec2 p, float t) {
    float lineCount = max(1.0, floor(20.0 * t));
    float angle = atan(p.y, p.x);
    float d = fract(angle / TAU * lineCount);
    float edge1 = smoothstep(0.5 - 0.25 - smoothness, 0.5 - 0.25 + smoothness, d);
    float edge2 = smoothstep(0.5 + 0.25 - smoothness, 0.5 + 0.25 + smoothness, d);
    return edge1 - edge2;
}

// Triangular grid pattern
float triangularGrid(vec2 p, float t) {
    // Skew for equilateral triangles
    vec2 skewed = vec2(p.x - p.y / SQRT3, p.y * 2.0 / SQRT3);
    vec2 cell = floor(skewed);
    vec2 f = fract(skewed);

    // Distance to nearest edge of the triangle
    float d;
    if (f.x + f.y < 1.0) {
        d = min(min(f.x, f.y), 1.0 - f.x - f.y);
    } else {
        d = min(min(1.0 - f.x, 1.0 - f.y), f.x + f.y - 1.0);
    }

    float edge = (1.0 - t) * 0.4;
    return smoothstep(edge - smoothness, edge + smoothness, d);
}

// Spiral pattern
float spiralPattern(vec2 p, float t) {
    float dist = length(p);
    float angle = atan(p.y, p.x);
    float d = fract(angle / TAU + dist);
    float edge1 = smoothstep(0.5 - t * 0.5 - smoothness, 0.5 - t * 0.5 + smoothness, d);
    float edge2 = smoothstep(0.5 + t * 0.5 - smoothness, 0.5 + t * 0.5 + smoothness, d);
    return edge1 - edge2;
}

void main() {
    // Normalize coordinates
    vec2 st = gl_FragCoord.xy / resolution;
    st = (st - 0.5) * 2.0;
    st.x *= aspect;
    
    // Apply rotation
    float rad = rotation * PI / 180.0;
    st = rotate2D(st, rad);
    
    // Apply scale, mapping so lower scale = higher frequency
    vec2 p = st * (21.0 - scale);
    
    // Compute pattern value
    float m = 0.0;
    
    if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == CONCENTRIC_RINGS) {
        m = concentricRings(p, thickness);
    } else if (patternType == DOTS) {
        m = dots(p, thickness);
    } else if (patternType == GRID) {
        m = grid(p, thickness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness);
    } else if (patternType == RADIAL_LINES) {
        m = radialLines(p, thickness);
    } else if (patternType == SPIRAL) {
        m = spiralPattern(p, thickness);
    } else if (patternType == STRIPES) {
        m = stripes(p, thickness);
    } else if (patternType == TRIANGULAR_GRID) {
        m = triangularGrid(p, thickness);
    }
    
    // Mix colors
    vec3 color = mix(bgColor, fgColor, m);
    
    fragColor = vec4(color, 1.0);
}
