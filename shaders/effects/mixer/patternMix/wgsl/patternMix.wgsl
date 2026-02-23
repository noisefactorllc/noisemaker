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

const STRIPES: i32 = 0;
const CHECKERBOARD: i32 = 1;
const GRID: i32 = 2;
const DOTS: i32 = 3;
const HEXAGONS: i32 = 4;
const DIAMONDS: i32 = 5;

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

fn diamonds(p: vec2<f32>, t: f32, sm: f32) -> f32 {
    let band = floor(p.x + p.y);
    let dir = band % 2.0;
    var rp: vec2<f32>;
    if (dir > 0.5) {
        rp = vec2<f32>(p.x - p.y, p.x + p.y);
    } else {
        rp = vec2<f32>(p.x + p.y, p.y - p.x);
    }
    rp = rp * 0.25;
    let f = fract(rp * 2.0);
    let gap = (1.0 - t) * 0.4;
    let lineX = smoothstep(gap - sm, gap + sm, abs(f.x - 0.5));
    let lineY = smoothstep(gap - sm, gap + sm, abs(f.y - 0.5));
    return lineX * lineY;
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

    // Invert swaps which input shows in the pattern
    if (invert == 1) {
        m = 1.0 - m;
    }

    // Mix: m=0 shows A, m=1 shows B
    var color = mix(colorA, colorB, m);
    color.a = max(colorA.a, colorB.a);

    return color;
}
