// WGSL version – WebGPU
@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> aspect: f32;
@group(0) @binding(2) var<uniform> patternType: i32;
@group(0) @binding(3) var<uniform> scale: f32;
@group(0) @binding(4) var<uniform> thickness: f32;
@group(0) @binding(5) var<uniform> smoothness: f32;
@group(0) @binding(6) var<uniform> rotation: f32;
@group(0) @binding(7) var<uniform> animation: i32;
@group(0) @binding(8) var<uniform> speed: f32;
@group(0) @binding(9) var<uniform> time: f32;
@group(0) @binding(10) var<uniform> fgColor: vec3<f32>;
@group(0) @binding(11) var<uniform> bgColor: vec3<f32>;

const PI: f32 = 3.14159265359;
const SQRT3: f32 = 1.7320508075688772;

// Pattern type constants
const CHECKERBOARD: i32 = 0;
const CONCENTRIC_RINGS: i32 = 1;
const DOTS: i32 = 2;
const GRID: i32 = 3;
const HEXAGONS: i32 = 4;
const RADIAL_LINES: i32 = 5;
const SPIRAL_PATTERN: i32 = 6;
const STRIPES: i32 = 7;
const TRIANGULAR_GRID: i32 = 8;
const HEARTS: i32 = 9;
const WAVES: i32 = 10;
const ZIGZAG: i32 = 11;
const TAU: f32 = 6.28318530718;

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

// Concentric rings pattern (timeOffset expands/contracts from center)
fn concentricRings(p: vec2<f32>, t: f32, sm: f32, timeOffset: f32) -> f32 {
    let d = fract(length(p) + timeOffset);
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, d);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, d);
    return edge1 - edge2;
}

// Radial lines pattern (timeOffset rotates around center)
fn radialLines(p: vec2<f32>, t: f32, sm: f32, timeOffset: f32) -> f32 {
    let lineCount = floor(scale);
    let angle = atan2(p.y, p.x) + timeOffset * TAU;
    let d = fract(angle / TAU * lineCount);
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, d);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, d);
    return edge1 - edge2;
}

// Triangular grid pattern
fn triangularGrid(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let skewed = vec2<f32>(p.x - p.y / SQRT3, p.y * 2.0 / SQRT3);
    let cell = floor(skewed);
    let f = fract(skewed);

    var d: f32;
    if (f.x + f.y < 1.0) {
        d = min(min(f.x, f.y), 1.0 - f.x - f.y);
    } else {
        d = min(min(1.0 - f.x, 1.0 - f.y), f.x + f.y - 1.0);
    }

    let edge = (1.0 - t) * 0.4;
    return smoothstep(edge - sm, edge + sm, d);
}

// Spiral pattern (timeOffset rotates arms)
fn spiralPattern(p: vec2<f32>, t: f32, sm: f32, timeOffset: f32) -> f32 {
    let dist = length(p);
    let angle = atan2(p.y, p.x) + timeOffset * TAU;
    let d = fract(angle / TAU + dist);
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, d);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, d);
    return edge1 - edge2;
}

// Heart SDF (based on Inigo Quilez)
fn heartSDF(p_in: vec2<f32>) -> f32 {
    var p = vec2<f32>(abs(p_in.x), p_in.y);
    if (p.y + p.x > 1.0) {
        let d = p - vec2<f32>(0.25, 0.75);
        return sqrt(dot(d, d)) - sqrt(2.0) / 4.0;
    }
    let d1 = p - vec2<f32>(0.0, 1.0);
    let proj = 0.5 * max(p.x + p.y, 0.0);
    let d2 = p - proj;
    return sqrt(min(dot(d1, d1), dot(d2, d2))) * sign(p.x - p.y);
}

// Hearts pattern (tiled heart shapes)
fn hearts(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    var cell = fract(p) - 0.5;
    cell.y += 0.25;
    let d = heartSDF(cell * 2.4);
    let radius = 0.15 - (t * 0.15);
    let s = min(sm, radius + 0.15);
    return 1.0 - smoothstep(-radius - s, -radius + s, d);
}

// Waves pattern (sine-displaced horizontal lines)
fn waves(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    var y = fract(p.y) - 0.5;
    y -= cos(p.x * TAU) * 0.15;
    let dist = abs(y);
    let halfW = t * 0.2;
    let s = min(sm, halfW + 0.01);
    return 1.0 - smoothstep(halfW - s, halfW + s, dist);
}

// Zigzag pattern (V-shaped line per cell)
fn zigzag(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let f = fract(p);
    // Zigzag line: y = 1 - 2*abs(x - 0.5), scaled to 0.25–0.75 range
    let lineY = 1.0 - 2.0 * abs(f.x - 0.5);
    let dist = abs(f.y - lineY * 0.5 - 0.25);
    // Max vertical distance to cell edge is 0.25; cap halfW + sm to stay within
    let halfW = t * 0.12;
    let s = min(sm, max(0.24 - halfW, 0.005));
    return 1.0 - smoothstep(halfW - s, halfW + s, dist);
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
    
    // Apply animation rotation/pan (only for non-centered patterns)
    let centered = patternType == CONCENTRIC_RINGS || patternType == RADIAL_LINES || patternType == SPIRAL_PATTERN;
    if (!centered && animation == 3) {
        st = rotate2D(st, time * TAU * floor(speed));
    }

    // Apply scale, mapping so lower scale = higher frequency
    var p = st * (21.0 - scale);

    if (!centered) {
        if (animation == 1) {
            p.x += time * -floor(speed);
        } else if (animation == 2) {
            p.y += time * floor(speed);
        }
    }

    // Compute pattern value
    var m: f32 = 0.0;
    
    if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == CONCENTRIC_RINGS) {
        m = concentricRings(p, thickness, smoothness, -time * floor(speed));
    } else if (patternType == DOTS) {
        m = dots(p, thickness, smoothness);
    } else if (patternType == GRID) {
        m = grid(p, thickness, smoothness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness, smoothness);
    } else if (patternType == RADIAL_LINES) {
        m = radialLines(p, thickness, smoothness, time * floor(speed));
    } else if (patternType == SPIRAL_PATTERN) {
        m = spiralPattern(p, thickness, smoothness, -time * floor(speed));
    } else if (patternType == STRIPES) {
        m = stripes(p, thickness, smoothness);
    } else if (patternType == TRIANGULAR_GRID) {
        m = triangularGrid(p, thickness, smoothness);
    } else if (patternType == HEARTS) {
        m = hearts(p, thickness, smoothness);
    } else if (patternType == WAVES) {
        m = waves(p, thickness, smoothness);
    } else if (patternType == ZIGZAG) {
        m = zigzag(p, thickness, smoothness);
    }
    
    // Mix colors
    let color = mix(bgColor, fgColor, m);
    
    return vec4<f32>(color, 1.0);
}
