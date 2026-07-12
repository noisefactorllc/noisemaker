// WGSL version – WebGPU
struct Uniforms {
    resolution: vec2<f32>,
    aspect: f32,
    time: f32,
    scale: f32,
    rotation: f32,
    thickness: f32,
    smoothness: f32,
    speed: f32,
    pulseDepth: f32,
    geometry: i32,
    rings: i32,
    starPoints: i32,
    animation: i32,
    fgColor: vec3<f32>,
    bgColor: vec3<f32>,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
    renderScale: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const SQRT3: f32 = 1.7320508075688772;

const ANIM_ROTATE: i32 = 1;
const ANIM_PULSE: i32 = 2;
const ANIM_RIPPLE: i32 = 4;
const ANIM_UNFOLD: i32 = 5;

const GEOM_FLOWER: i32 = 0;
const GEOM_FRUIT: i32 = 1;
const GEOM_METATRON: i32 = 3;
const GEOM_SEED: i32 = 4;
const GEOM_VESICA: i32 = 5;
const GEOM_BORROMEAN: i32 = 6;
const GEOM_STARPOLYGON: i32 = 7;
const GEOM_TRIQUETRA: i32 = 8;

fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn lineSegmentSDF(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

fn outlineEdge(d: f32, w: f32) -> f32 {
    return smoothstep(w + u.smoothness, w - u.smoothness, abs(d));
}

fn ripplePulse(phase: f32) -> f32 {
    return 1.0 + u.pulseDepth * sin(u.time * TAU * floor(u.speed) - phase);
}

fn unfoldVis(t_e: f32) -> f32 {
    return max(0.0, sin((u.time - t_e * 0.5) * TAU * floor(u.speed)));
}

fn flowerMask(p_in: vec2<f32>, ringsN: i32, figureScale: f32) -> f32 {
    let lineWidth = 0.04 + u.thickness * 0.12;
    let circleRadius = 1.0;
    let p = p_in * figureScale;

    var m: f32 = 0.0;
    for (var q: i32 = -6; q <= 6; q = q + 1) {
        if (q < -ringsN || q > ringsN) { continue; }
        for (var r: i32 = -6; r <= 6; r = r + 1) {
            if (r < -ringsN || r > ringsN) { continue; }
            if (q + r < -ringsN || q + r > ringsN) { continue; }

            let center = vec2<f32>(f32(q) + f32(r) * 0.5, f32(r) * SQRT3 * 0.5);
            let hexDist = max(max(abs(f32(q)), abs(f32(r))), abs(f32(q + r)));

            var circleR = circleRadius;
            if (u.animation == ANIM_RIPPLE) {
                circleR = circleR * ripplePulse(hexDist * 1.4);
            }
            let d = length(p - center) - circleR;

            var vis: f32 = 1.0;
            if (u.animation == ANIM_UNFOLD) {
                let t_e = hexDist / max(f32(ringsN), 1.0);
                vis = unfoldVis(t_e);
            }

            m = max(m, outlineEdge(d, lineWidth) * vis);
        }
    }
    return m;
}

fn fruitMask(p_in: vec2<f32>, drawLines: bool) -> f32 {
    let lineWidth = 0.04 + u.thickness * 0.12;
    let p = p_in * 0.5;

    var centers: array<vec2<f32>, 13>;
    centers[0] = vec2<f32>(0.0, 0.0);
    for (var k: i32 = 0; k < 6; k = k + 1) {
        let angle = f32(k) * PI / 3.0;
        centers[1 + k] = 2.0 * vec2<f32>(cos(angle), sin(angle));
    }
    for (var k: i32 = 0; k < 6; k = k + 1) {
        let angle = f32(k) * PI / 3.0 + PI / 6.0;
        centers[7 + k] = 2.0 * SQRT3 * vec2<f32>(cos(angle), sin(angle));
    }

    let maxCircleDist = 2.0 * SQRT3;
    var circleUnfoldRange: f32 = 1.0;
    if (drawLines) {
        circleUnfoldRange = 0.6;
    }

    var m: f32 = 0.0;

    for (var i: i32 = 0; i < 13; i = i + 1) {
        let distFromOrigin = length(centers[i]);

        var circleR: f32 = 1.0;
        if (u.animation == ANIM_RIPPLE) {
            circleR = circleR * ripplePulse(distFromOrigin * 0.8);
        }
        let d = length(p - centers[i]) - circleR;

        var vis: f32 = 1.0;
        if (u.animation == ANIM_UNFOLD) {
            let t_e = distFromOrigin / maxCircleDist * circleUnfoldRange;
            vis = unfoldVis(t_e);
        }

        m = max(m, outlineEdge(d, lineWidth) * vis);
    }

    if (drawLines) {
        var lineVis: f32 = 1.0;
        if (u.animation == ANIM_UNFOLD) {
            lineVis = unfoldVis(0.65);
        }
        for (var i: i32 = 0; i < 13; i = i + 1) {
            for (var j: i32 = 0; j < 13; j = j + 1) {
                if (j <= i) { continue; }
                let dL = lineSegmentSDF(p, centers[i], centers[j]);
                m = max(m, outlineEdge(dL, lineWidth * 0.5) * lineVis);
            }
        }
    }

    return m;
}

fn vesicaMask(p_in: vec2<f32>) -> f32 {
    let lineWidth = 0.04 + u.thickness * 0.12;
    let p = p_in * 0.25;
    let r = 1.5;
    let sep = r * 0.5;

    var rA: f32 = r;
    var rB: f32 = r;
    if (u.animation == ANIM_RIPPLE) {
        rA = rA * ripplePulse(0.0);
        rB = rB * ripplePulse(PI);
    }

    var visA: f32 = 1.0;
    var visB: f32 = 1.0;
    if (u.animation == ANIM_UNFOLD) {
        visA = unfoldVis(0.0);
        visB = unfoldVis(0.5);
    }

    let dA = length(p - vec2<f32>(-sep, 0.0)) - rA;
    let dB = length(p - vec2<f32>( sep, 0.0)) - rB;

    var m: f32 = 0.0;
    m = max(m, outlineEdge(dA, lineWidth) * visA);
    m = max(m, outlineEdge(dB, lineWidth) * visB);
    return m;
}

fn triquetraMask(p_in: vec2<f32>) -> f32 {
    let lineWidth = 0.04 + u.thickness * 0.12;
    let p = p_in * 0.30;
    let r = 2.25;
    let dist = r / SQRT3;

    let C0 = dist * vec2<f32>(cos(PI * 0.5),                       sin(PI * 0.5));
    let C1 = dist * vec2<f32>(cos(PI * 0.5 + TAU / 3.0),           sin(PI * 0.5 + TAU / 3.0));
    let C2 = dist * vec2<f32>(cos(PI * 0.5 + 2.0 * TAU / 3.0),     sin(PI * 0.5 + 2.0 * TAU / 3.0));

    var r0: f32 = r;
    var r1: f32 = r;
    var r2: f32 = r;
    if (u.animation == ANIM_RIPPLE) {
        r0 = r0 * ripplePulse(0.0);
        r1 = r1 * ripplePulse(TAU / 3.0);
        r2 = r2 * ripplePulse(2.0 * TAU / 3.0);
    }

    let d0 = length(p - C0) - r0;
    let d1 = length(p - C1) - r1;
    let d2 = length(p - C2) - r2;

    var v01: f32 = 1.0;
    var v02: f32 = 1.0;
    var v12: f32 = 1.0;
    if (u.animation == ANIM_UNFOLD) {
        v01 = unfoldVis(0.0);
        v02 = unfoldVis(0.33);
        v12 = unfoldVis(0.66);
    }

    var m: f32 = 0.0;
    m = max(m, outlineEdge(max(d0, d1), lineWidth) * v01);
    m = max(m, outlineEdge(max(d0, d2), lineWidth) * v02);
    m = max(m, outlineEdge(max(d1, d2), lineWidth) * v12);
    return m;
}

fn borromeanMask(p_in: vec2<f32>) -> f32 {
    let lineWidth = 0.04 + u.thickness * 0.12;
    let p = p_in * 0.32;
    let r = 1.5;
    let dist = 1.4;

    var m: f32 = 0.0;
    for (var i: i32 = 0; i < 3; i = i + 1) {
        let angle = f32(i) * TAU / 3.0 + PI * 0.5;
        let c = dist * vec2<f32>(cos(angle), sin(angle));

        var circleR = r;
        if (u.animation == ANIM_RIPPLE) {
            circleR = circleR * ripplePulse(f32(i) * TAU / 3.0);
        }
        let d = length(p - c) - circleR;

        var vis: f32 = 1.0;
        if (u.animation == ANIM_UNFOLD) {
            vis = unfoldVis(f32(i) / 3.0);
        }

        m = max(m, outlineEdge(d, lineWidth) * vis);
    }
    return m;
}

fn starPolygonMask(p_in: vec2<f32>, n: i32) -> f32 {
    let lineWidth = 0.04 + u.thickness * 0.12;
    let p = p_in * 0.32;
    var radius = 2.8;

    if (u.animation == ANIM_RIPPLE) {
        radius = radius * ripplePulse(0.0);
    }

    var m: f32 = 0.0;
    for (var i: i32 = 0; i < 12; i = i + 1) {
        if (i >= n) { break; }
        let j = (i + 2) - ((i + 2) / n) * n;
        let angle1 = f32(i) * TAU / f32(n) + PI * 0.5;
        let angle2 = f32(j) * TAU / f32(n) + PI * 0.5;
        let a = radius * vec2<f32>(cos(angle1), sin(angle1));
        let b = radius * vec2<f32>(cos(angle2), sin(angle2));
        let dL = lineSegmentSDF(p, a, b);

        var vis: f32 = 1.0;
        if (u.animation == ANIM_UNFOLD) {
            vis = unfoldVis(f32(i) / f32(n));
        }

        m = max(m, outlineEdge(dL, lineWidth) * vis);
    }
    return m;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var st = (position.xy + u.tileOffset) / u.fullResolution;
    st = (st - vec2<f32>(0.5, 0.5)) * 2.0;
    st.x = st.x * u.aspect;

    let rad = u.rotation * PI / 180.0;
    st = rotate2D(st, rad);

    if (u.animation == ANIM_ROTATE) {
        st = rotate2D(st, u.time * TAU * floor(u.speed));
    }

    var scaleFactor = 21.0 - u.scale;
    if (u.animation == ANIM_PULSE) {
        scaleFactor = scaleFactor * (1.0 + u.pulseDepth * sin(u.time * TAU * floor(u.speed)));
    }

    let p = st * scaleFactor;

    var m: f32 = 0.0;
    if (u.geometry == GEOM_FLOWER) {
        m = flowerMask(p, u.rings, 0.45);
    } else if (u.geometry == GEOM_SEED) {
        m = flowerMask(p, 1, 0.23);
    } else if (u.geometry == GEOM_FRUIT) {
        m = fruitMask(p, false);
    } else if (u.geometry == GEOM_METATRON) {
        m = fruitMask(p, true);
    } else if (u.geometry == GEOM_VESICA) {
        m = vesicaMask(p);
    } else if (u.geometry == GEOM_BORROMEAN) {
        m = borromeanMask(p);
    } else if (u.geometry == GEOM_TRIQUETRA) {
        m = triquetraMask(p);
    } else if (u.geometry == GEOM_STARPOLYGON) {
        m = starPolygonMask(p, u.starPoints);
    }

    m = clamp(m, 0.0, 1.0);
    let color = mix(u.bgColor, u.fgColor, m);
    return vec4<f32>(color, 1.0);
}
