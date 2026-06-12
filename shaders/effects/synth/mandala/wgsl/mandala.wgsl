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
    layerSpacing: f32,
    twist: f32,
    shapeGrowth: f32,
    symmetry: i32,
    layers: i32,
    shape: i32,
    bindu: i32,
    animation: i32,
    fgColor: vec3<f32>,
    bgColor: vec3<f32>,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const SQRT3: f32 = 1.7320508075688772;

const SHAPE_PETAL: i32 = 0;
const SHAPE_TRIANGLE: i32 = 1;
const SHAPE_DOT: i32 = 2;

const ANIM_ROTATE: i32 = 1;
const ANIM_PULSE: i32 = 2;
const ANIM_DIFFERENTIAL: i32 = 3;
const ANIM_COUNTERROTATE: i32 = 4;
const ANIM_SPIRALWAVE: i32 = 5;
const ANIM_RIPPLE: i32 = 6;

// GLSL-style mod() — always non-negative when b > 0.
fn floorMod(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn rotate2D(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn sdEquilateralTriangle(p_in: vec2<f32>, r: f32) -> f32 {
    let k = SQRT3;
    var p = vec2<f32>(abs(p_in.x) - r, p_in.y + r / k);
    if (p.x + k * p.y > 0.0) {
        p = vec2<f32>(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    }
    p.x = p.x - clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
}

fn fillEdge(d: f32) -> f32 {
    return smoothstep(u.smoothness, -u.smoothness, d);
}

fn mandalaMask(p: vec2<f32>) -> f32 {
    let r = length(p);
    let theta = atan2(p.y, p.x) - PI * 0.5;
    let wedge = TAU / f32(u.symmetry);
    let twistRad = u.twist * PI / 180.0;
    let baseSize = 0.25 + u.thickness * 0.65;

    // spiralWave: twist oscillates over the cycle using `twist` as amplitude.
    var dynTwistRad = twistRad;
    if (u.animation == ANIM_SPIRALWAVE) {
        dynTwistRad = twistRad * sin(u.time * TAU * floor(u.speed));
    }

    var m: f32 = 0.0;

    if (u.bindu != 0) {
        let dBindu = length(p) - (0.15 + u.thickness * 0.15);
        m = max(m, fillEdge(dBindu));
    }

    for (var i: i32 = 0; i < 12; i = i + 1) {
        if (i >= u.layers) { break; }
        let Rlayer = f32(i + 1) * u.layerSpacing;

        // Per-layer animation rotation.
        var layerAnimRot: f32 = 0.0;
        if (u.animation == ANIM_DIFFERENTIAL) {
            layerAnimRot = u.time * TAU * (floor(u.speed) + f32(i));
        } else if (u.animation == ANIM_COUNTERROTATE) {
            var dir: f32 = 1.0;
            if (floorMod(f32(i), 2.0) >= 0.5) {
                dir = -1.0;
            }
            layerAnimRot = u.time * TAU * floor(u.speed) * dir;
        }

        let layerTheta = theta - f32(i) * dynTwistRad - layerAnimRot;
        let folded = abs(floorMod(layerTheta + wedge * 0.5, wedge) - wedge * 0.5);
        let radial = r - Rlayer;
        let tangent = folded * Rlayer;

        var lt: f32 = 0.0;
        if (u.layers > 1) {
            lt = f32(i) / f32(u.layers - 1) - 0.5;
        }
        var shapeSize = baseSize * (1.0 + u.shapeGrowth * lt);

        // ripple: per-layer pulse with phase offset.
        if (u.animation == ANIM_RIPPLE) {
            shapeSize = shapeSize * (1.0 + u.pulseDepth * sin(u.time * TAU * floor(u.speed) - f32(i) * 0.6));
        }

        if (u.shape == SHAPE_PETAL) {
            let d = length(vec2<f32>(radial * 0.55, tangent)) - shapeSize;
            m = max(m, fillEdge(d));
        } else if (u.shape == SHAPE_TRIANGLE) {
            let q = vec2<f32>(tangent, -radial);
            let d = sdEquilateralTriangle(q, shapeSize);
            m = max(m, fillEdge(d));
        } else {
            let d = length(vec2<f32>(radial, tangent)) - shapeSize * 0.7;
            m = max(m, fillEdge(d));
        }
    }
    return m;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var st = position.xy / u.resolution;
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

    let m = clamp(mandalaMask(p), 0.0, 1.0);
    let color = mix(u.bgColor, u.fgColor, m);
    return vec4<f32>(color, 1.0);
}
