@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> symmetry: i32;
@group(0) @binding(5) var<uniform> scale: f32;
@group(0) @binding(6) var<uniform> offsetX: f32;
@group(0) @binding(7) var<uniform> offsetY: f32;
@group(0) @binding(8) var<uniform> angle: f32;
@group(0) @binding(9) var<uniform> repeat: f32;
@group(0) @binding(10) var<uniform> aspectLens: i32;

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

fn mod2(v: vec2<f32>, m: vec2<f32>) -> vec2<f32> {
    return v - m * floor(v / m);
}

fn hexCoord(uv: vec2<f32>) -> vec2<f32> {
    let s = vec2<f32>(1.0, 1.7320508);
    let h = s * 0.5;

    let a = mod2(uv, s) - h;
    let b = mod2(uv + h, s) - h;

    if (dot(a, a) < dot(b, b)) {
        return a;
    } else {
        return b;
    }
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
    let asp = texSize.x / texSize.y;
    let doAspect = aspectLens != 0;

    // Rotate in aspect-corrected space to avoid shearing on non-square canvases
    var st = uv - 0.5;
    if (doAspect) { st.x *= asp; }
    st = rot(st, angle * PI / 180.0);
    if (doAspect) { st.x /= asp; }
    st += 0.5;

    // Aspect-corrected repeat count: more tiles along the longer axis
    let rep = select(vec2<f32>(repeat), vec2<f32>(repeat * asp, repeat), doAspect);

    if (symmetry == 3) {
        // Hex tiling with 6-fold rotational symmetry
        // Offset pans the entire texture (applied before hex grid computation)
        let local_hex = hexCoord((st + vec2<f32>(offsetX, offsetY)) * rep);
        let local_scaled = local_hex / scale;
        st = rotationalFold(local_scaled + 0.5, 6);
    } else {
        // Square tiling
        st = fract2(st * rep);

        // Apply source region transforms (before fold — fold handles any input range)
        // mirrorXY needs half the range so edges match at default scale
        var effectiveScale = scale;
        if (symmetry == 0) { effectiveScale = scale * 0.5; }
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
        } else {
            // rotate4
            st = rotationalFold(fract2(st), 4);
        }
    }

    // Clamp to valid texture range
    st = clamp(st, vec2<f32>(0.0), vec2<f32>(1.0));

    return vec4<f32>(textureSampleLevel(inputTex, samp, st, 0.0).rgb, 1.0);
}
