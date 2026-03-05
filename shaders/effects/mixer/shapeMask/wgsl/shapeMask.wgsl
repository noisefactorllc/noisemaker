@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> shape : i32;
@group(0) @binding(4) var<uniform> radius : f32;
@group(0) @binding(5) var<uniform> edgeSmooth : f32;
@group(0) @binding(6) var<uniform> rotation : f32;
@group(0) @binding(7) var<uniform> posX : f32;
@group(0) @binding(8) var<uniform> posY : f32;
@group(0) @binding(9) var<uniform> invert : i32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn sdfCircle(p: vec2<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn sdfPolygon(p: vec2<f32>, r: f32, sides: f32) -> f32 {
    let a = atan2(p.x, p.y) + PI;
    let seg = TAU / sides;
    return cos(floor(0.5 + a / seg) * seg - a) * length(p) - r;
}

fn sdfTriangle(p_in: vec2<f32>, r: f32) -> f32 {
    let k = 1.732050808; // sqrt(3)
    var p = vec2<f32>(abs(p_in.x) - r, p_in.y + r / k);
    if (p.x + k * p.y > 0.0) { p = vec2<f32>(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

fn sdfFlower(p: vec2<f32>, r: f32) -> f32 {
    let outerR = r;
    let innerR = r * 0.45;
    let a = atan2(p.x, p.y) + PI;
    let seg = TAU / 5.0;
    let halfSeg = seg * 0.5;
    let segAngle = a % seg;
    let t = abs(segAngle - halfSeg) / halfSeg;
    let starR = mix(innerR, outerR, t);
    return length(p) - starR;
}

fn sdfStar5(p_in: vec2<f32>, r: f32) -> f32 {
    let rf = 0.4;
    let k1 = vec2<f32>(0.809016994375, -0.587785252292);
    let k2 = vec2<f32>(-k1.x, k1.y);
    var p = vec2<f32>(abs(p_in.x), p_in.y);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    let ba = rf * vec2<f32>(-k1.y, k1.x) - vec2<f32>(0.0, 1.0);
    let h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

fn sdfRing(p: vec2<f32>, r: f32) -> f32 {
    let ringWidth = r * 0.15;
    return abs(length(p) - r) - ringWidth;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = position.xy / dims;

    let colorA = textureSample(inputTex, samp, st);
    let colorB = textureSample(tex, samp, st);

    // Centered, aspect-correct coordinates
    let aspect = dims.x / dims.y;
    var p = (st - vec2<f32>(0.5, 0.5)) * 2.0;
    p.x = p.x * aspect;

    // Apply position offset
    p = p - vec2<f32>(posX * aspect, -posY);

    // Apply rotation
    let rad = rotation * PI / 180.0;
    p = rotate2D(p, rad);

    // Evaluate SDF
    var d: f32 = 0.0;
    if (shape == 0) {
        d = sdfCircle(p, radius);
    } else if (shape == 1) {
        d = sdfTriangle(p, radius);
    } else if (shape == 2) {
        d = sdfPolygon(p, radius, 4.0);
    } else if (shape == 3) {
        d = sdfPolygon(p, radius, 5.0);
    } else if (shape == 4) {
        d = sdfPolygon(p, radius, 6.0);
    } else if (shape == 5) {
        d = sdfFlower(p, radius);
    } else if (shape == 6) {
        d = sdfRing(p, radius);
    } else if (shape == 7) {
        d = sdfStar5(p, radius);
    }

    // Smoothstep mask: 0 inside, 1 outside
    var mask = smoothstep(-edgeSmooth, edgeSmooth, d);

    // Invert swaps inside/outside
    if (invert == 1) {
        mask = 1.0 - mask;
    }

    // A inside shape, B outside (before invert)
    var color = mix(colorA, colorB, mask);
    color.a = max(colorA.a, colorB.a);

    return color;
}
