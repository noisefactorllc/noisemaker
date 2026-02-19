@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> symmetry: i32;
@group(0) @binding(5) var<uniform> scale: f32;
@group(0) @binding(6) var<uniform> offsetX: f32;
@group(0) @binding(7) var<uniform> offsetY: f32;
@group(0) @binding(8) var<uniform> angle: f32;
@group(0) @binding(9) var<uniform> repeatCount: f32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rot(p: vec2<f32>, a: f32) -> vec2<f32> {
    let c = cos(a);
    let s = sin(a);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn mirrorFold(t: f32) -> f32 {
    return 1.0 - abs(2.0 * fract(t * 0.5) - 1.0);
}

fn fract2(v: vec2<f32>) -> vec2<f32> {
    return v - floor(v);
}

fn rotationalFold(uv: vec2<f32>, n: i32) -> vec2<f32> {
    let fn_val = f32(n);
    let sectorAngle = TAU / fn_val;

    let p = uv - 0.5;
    var a = atan2(p.y, p.x);
    let r = length(p);

    a = ((a + TAU) % TAU) % sectorAngle;
    if (a > sectorAngle * 0.5) {
        a = sectorAngle - a;
    }

    return vec2<f32>(r * cos(a), r * sin(a)) + 0.5;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = position.xy / texSize;

    // Rotate the entire tiled grid (before fract so all tiles rotate together)
    var st = rot(uv - 0.5, angle * PI / 180.0) + 0.5;

    // Apply tiling repetition
    st = fract2(st * repeatCount);

    // Apply source region transforms (before fold — fold handles any input range)
    // mirrorXY needs half the range so edges match at default scale
    var effectiveScale = scale;
    if (symmetry == 0) { effectiveScale = scale * 2.0; }
    st = (st - 0.5) / effectiveScale;
    st = st + 0.5 + vec2<f32>(offsetX, offsetY);

    // Apply symmetry fold
    if (symmetry == 0) {
        // mirrorXY
        st.x = mirrorFold(st.x);
        st.y = mirrorFold(st.y);
    } else if (symmetry == 1) {
        // rotate2
        st = rotationalFold(fract2(st), 2);
    } else if (symmetry == 2) {
        // rotate4
        st = rotationalFold(fract2(st), 4);
    } else {
        // rotate6
        st = rotationalFold(fract2(st), 6);
    }

    // Clamp to valid texture range
    st = clamp(st, vec2<f32>(0.0), vec2<f32>(1.0));

    return vec4<f32>(textureSample(inputTex, samp, st).rgb, 1.0);
}
