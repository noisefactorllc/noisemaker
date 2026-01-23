// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> patternType: i32;
@group(0) @binding(3) var<uniform> scale: f32;
@group(0) @binding(4) var<uniform> thickness: f32;
@group(0) @binding(5) var<uniform> smoothness: f32;
@group(0) @binding(6) var<uniform> rotation: f32;
@group(0) @binding(7) var<uniform> fgColor: vec3<f32>;
@group(0) @binding(8) var<uniform> bgColor: vec3<f32>;

const PI: f32 = 3.14159265359;
const SQRT3: f32 = 1.7320508075688772;

// Pattern type constants
const STRIPES: i32 = 0;
const CHECKERBOARD: i32 = 1;
const GRID: i32 = 2;
const DOTS: i32 = 3;
const HEXAGONS: i32 = 4;
const DIAMONDS: i32 = 5;

// Rotate a 2D point
fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Stripes pattern
fn stripes(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let stripe = fract(p.x);
    // Apply smoothness to both edges of the stripe
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, stripe);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, stripe);
    return edge1 - edge2;
}

// Checkerboard pattern
fn checkerboard(p: vec2<f32>, sm: f32) -> f32 {
    let f = fract(p);
    // Distance to nearest cell edge
    let d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    // Determine which cell we're in
    let cell = floor(p);
    let check = (cell.x + cell.y) % 2.0;
    // Apply smoothness at edges
    let edge = smoothstep(0.0, sm * 0.5, d);
    return mix(1.0 - check, check, edge);
}

// Grid pattern (lines forming a grid)
fn grid(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let f = fract(p);
    let lineX = smoothstep(t * 0.5 - sm, t * 0.5 + sm, abs(f.x - 0.5));
    let lineY = smoothstep(t * 0.5 - sm, t * 0.5 + sm, abs(f.y - 0.5));
    return 1.0 - min(lineX, lineY);
}

// Dots pattern (circles on a grid)
fn dots(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let f = fract(p) - vec2<f32>(0.5, 0.5);
    let d = length(f);
    let radius = t * 0.5;
    return 1.0 - smoothstep(radius - sm, radius + sm, d);
}

// Hexagon distance function
fn hexDist(p: vec2<f32>) -> f32 {
    let ap = abs(p);
    return max(ap.x * 0.5 + ap.y * (SQRT3 / 2.0), ap.x);
}

// Hexagons pattern
fn hexagons(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    // Scale for hexagonal grid
    let s = vec2<f32>(1.0, SQRT3);
    let h = s * 0.5;
    
    // Two offset grids
    let a = (p % s) - h;
    let b = ((p + h) % s) - h;
    
    // Choose closest hexagon center
    var g: vec2<f32>;
    if (length(a) < length(b)) {
        g = a;
    } else {
        g = b;
    }
    
    let d = hexDist(g);
    let edge = 0.5 * t;
    return smoothstep(edge + sm, edge - sm, d);
}

// Diamonds pattern (herringbone-style angled bricks)
fn diamonds(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    // Determine which diagonal band we're in
    let band = floor(p.x + p.y);
    let dir = band % 2.0;
    
    // Rotate coordinates based on band direction
    var rp: vec2<f32>;
    if (dir > 0.5) {
        rp = vec2<f32>(p.x - p.y, p.x + p.y);
    } else {
        rp = vec2<f32>(p.x + p.y, p.y - p.x);
    }
    rp = rp * 0.25;  // Even larger scale
    
    let f = fract(rp * 2.0);
    
    // Create brick pattern in rotated space - invert thickness so larger t = larger bricks
    let gap = (1.0 - t) * 0.4;  // Gap size decreases as thickness increases
    let lineX = smoothstep(gap - sm, gap + sm, abs(f.x - 0.5));
    let lineY = smoothstep(gap - sm, gap + sm, abs(f.y - 0.5));
    
    return lineX * lineY;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // Normalize coordinates
    var st = position.xy / resolution;
    st = (st - vec2<f32>(0.5, 0.5)) * 2.0;
    st.x = st.x * aspect;
    
    // Apply rotation
    let rad = rotation * PI / 180.0;
    st = rotate2D(st, rad);
    
    // Apply scale
    let p = st * scale;
    
    // Compute pattern value
    var m: f32 = 0.0;
    
    if (patternType == STRIPES) {
        m = stripes(p, thickness, smoothness);
    } else if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == GRID) {
        m = grid(p, thickness, smoothness);
    } else if (patternType == DOTS) {
        m = dots(p, thickness, smoothness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness, smoothness);
    } else if (patternType == DIAMONDS) {
        m = diamonds(p, thickness, smoothness);
    }
    
    // Mix colors
    let color = mix(bgColor, fgColor, m);
    
    return vec4<f32>(color, 1.0);
}
