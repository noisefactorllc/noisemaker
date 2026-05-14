@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> patternType : i32;
@group(0) @binding(4) var<uniform> scale : f32;
@group(0) @binding(5) var<uniform> thickness : f32;
@group(0) @binding(6) var<uniform> smoothness : f32;
@group(0) @binding(7) var<uniform> rotation : f32;
@group(0) @binding(8) var<uniform> invert : i32;

const PI: f32 = 3.14159265359;
const SQRT3: f32 = 1.7320508075688772;

const CHECKERBOARD: i32 = 0;
const CONCENTRIC_RINGS: i32 = 1;
const DOTS: i32 = 2;
const GRID: i32 = 3;
const HEXAGONS: i32 = 4;
const RADIAL_LINES: i32 = 5;
const SPIRAL_PATTERN: i32 = 6;
const STRIPES: i32 = 7;
const TRIANGULAR_GRID: i32 = 8;
const TAU: f32 = 6.28318530718;

fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn stripes(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let stripe = fract(p.x);
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, stripe);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, stripe);
    return edge1 - edge2;
}

fn checkerboard(p: vec2<f32>, sm: f32) -> f32 {
    let f = fract(p);
    let d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    let cell = floor(p);
    let check = (cell.x + cell.y) % 2.0;
    let edge = smoothstep(0.0, sm * 0.5, d);
    return mix(1.0 - check, check, edge);
}

fn grid(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let f = fract(p);
    let lineX = smoothstep(t * 0.5 - sm, t * 0.5 + sm, abs(f.x - 0.5));
    let lineY = smoothstep(t * 0.5 - sm, t * 0.5 + sm, abs(f.y - 0.5));
    return 1.0 - min(lineX, lineY);
}

fn dots(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let f = fract(p) - vec2<f32>(0.5, 0.5);
    let d = length(f);
    let r = t * 0.5;
    return 1.0 - smoothstep(r - sm, r + sm, d);
}

fn hexDist(p: vec2<f32>) -> f32 {
    let ap = abs(p);
    return max(ap.x * 0.5 + ap.y * (SQRT3 / 2.0), ap.x);
}

fn hexagons(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let s = vec2<f32>(1.0, SQRT3);
    let h = s * 0.5;
    let a = (p % s) - h;
    let b = ((p + h) % s) - h;
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

// Concentric rings pattern
fn concentricRings(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let d = fract(length(p));
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, d);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, d);
    return edge1 - edge2;
}

// Radial lines pattern
fn radialLines(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let lineCount = max(1.0, floor(20.0 * t));
    let angle = atan2(p.y, p.x);
    let d = fract(angle / TAU * lineCount);
    let edge1 = smoothstep(0.5 - 0.25 - sm, 0.5 - 0.25 + sm, d);
    let edge2 = smoothstep(0.5 + 0.25 - sm, 0.5 + 0.25 + sm, d);
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

// Spiral pattern
fn spiralPattern(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let dist = length(p);
    let angle = atan2(p.y, p.x);
    let d = fract(angle / TAU + dist);
    let edge1 = smoothstep(0.5 - t * 0.5 - sm, 0.5 - t * 0.5 + sm, d);
    let edge2 = smoothstep(0.5 + t * 0.5 - sm, 0.5 + t * 0.5 + sm, d);
    return edge1 - edge2;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let colorA = textureSample(inputTex, samp, st);
    let colorB = textureSample(tex, samp, st);

    // Center and aspect-correct
    let aspect = dims.x / dims.y;
    var p = (st - vec2<f32>(0.5, 0.5)) * 2.0;
    p.x = p.x * aspect;

    // Apply rotation
    let rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Apply scale (lower scale = higher frequency, matching synth/pattern)
    p = p * (21.0 - scale);

    // Compute pattern mask
    var m: f32 = 0.0;
    if (patternType == CHECKERBOARD) {
        m = checkerboard(p, smoothness);
    } else if (patternType == CONCENTRIC_RINGS) {
        m = concentricRings(p, thickness, smoothness);
    } else if (patternType == DOTS) {
        m = dots(p, thickness, smoothness);
    } else if (patternType == GRID) {
        m = grid(p, thickness, smoothness);
    } else if (patternType == HEXAGONS) {
        m = hexagons(p, thickness, smoothness);
    } else if (patternType == RADIAL_LINES) {
        m = radialLines(p, thickness, smoothness);
    } else if (patternType == SPIRAL_PATTERN) {
        m = spiralPattern(p, thickness, smoothness);
    } else if (patternType == STRIPES) {
        m = stripes(p, thickness, smoothness);
    } else if (patternType == TRIANGULAR_GRID) {
        m = triangularGrid(p, thickness, smoothness);
    }

    // Invert swaps which input shows in the pattern
    if (invert == 1) {
        m = 1.0 - m;
    }

    // Mix: m=0 shows A, m=1 shows B
    var color = mix(colorA, colorB, m);
    color.a = max(colorA.a, colorB.a);

    return color;
}
