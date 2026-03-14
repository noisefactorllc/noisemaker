// WGSL version – WebGPU

/*
 * Gradient generator shader.
 * Renders linear, radial, conic, and four corners gradients with rotation and repeat.
 */

@group(0) @binding(0) var<uniform> resolution: vec2<f32>;
@group(0) @binding(1) var<uniform> gradientType: i32;
@group(0) @binding(2) var<uniform> rotation: f32;
@group(0) @binding(3) var<uniform> repeat: i32;
@group(0) @binding(4) var<uniform> color1: vec3<f32>;
@group(0) @binding(5) var<uniform> color2: vec3<f32>;
@group(0) @binding(6) var<uniform> color3: vec3<f32>;
@group(0) @binding(7) var<uniform> color4: vec3<f32>;
@group(0) @binding(8) var<uniform> seed: i32;
@group(0) @binding(9) var<uniform> time: f32;
@group(0) @binding(10) var<uniform> speed: f32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rotate2D(st: vec2<f32>, angle: f32) -> vec2<f32> {
    let aspectRatio = resolution.x / resolution.y;
    var coord = st;
    coord.x = coord.x * aspectRatio;
    coord = coord - vec2<f32>(aspectRatio * 0.5, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    coord = mat2x2<f32>(c, -s, s, c) * coord;
    coord = coord + vec2<f32>(aspectRatio * 0.5, 0.5);
    coord.x = coord.x / aspectRatio;
    return coord;
}

// Blend 4 colors based on a 0-1 parameter t, cycling through all 4
fn blend4Colors(t_in: f32) -> vec3<f32> {
    let t = fract(t_in); // Ensure t is in [0, 1]
    let segment = t * 4.0;
    let idx = i32(floor(segment));
    let localT = fract(segment);
    
    switch idx {
        case 0: {
            return mix(color1, color2, localT);
        }
        case 1: {
            return mix(color2, color3, localT);
        }
        case 2: {
            return mix(color3, color4, localT);
        }
        default: {
            return mix(color4, color1, localT);
        }
    }
}

// PCG PRNG for noise gradient
fn pcg(seed_in: vec3<u32>) -> vec3<u32> {
    var v = seed_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

fn hash2D(p: vec2<f32>) -> f32 {
    return prng(vec3<f32>(p, f32(seed))).x;
}

fn valueNoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);

    let a = hash2D(i);
    let b = hash2D(i + vec2<f32>(1.0, 0.0));
    let c = hash2D(i + vec2<f32>(0.0, 1.0));
    let d = hash2D(i + vec2<f32>(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbmNoise(p: vec2<f32>) -> f32 {
    var sum: f32 = 0.0;
    var amp: f32 = 0.5;
    var freq: f32 = 1.0;
    var maxVal: f32 = 0.0;
    for (var i: i32 = 0; i < 4; i = i + 1) {
        sum = sum + valueNoise(p * freq) * amp;
        maxVal = maxVal + amp;
        freq = freq * 2.0;
        amp = amp * 0.5;
    }
    return sum / maxVal;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let st = pos.xy / resolution;
    let aspectRatio = resolution.x / resolution.y;
    
    // Convert rotation from degrees to radians
    let angle = -rotation * PI / 180.0;
    
    // Apply rotation for linear and conic gradients
    let rotatedSt = rotate2D(st, angle);
    
    // Centered coordinates for radial and conic
    var centered = st - 0.5;
    centered.x = centered.x * aspectRatio;
    
    // Rotated centered for conic
    let c = cos(angle);
    let s = sin(angle);
    let rotatedCentered = mat2x2<f32>(c, -s, s, c) * centered;
    
    var color: vec3<f32>;
    var t: f32;
    let timeOffset = time * speed;

    switch gradientType {
        case 0: {
            // Conic/angular gradient
            let a = atan2(rotatedCentered.y, rotatedCentered.x);
            t = (a + PI) / TAU;
            t = fract(t * f32(repeat) + timeOffset);
            color = blend4Colors(t);
        }
        case 1: {
            // Diamond gradient - L1 distance with rotation
            t = abs(rotatedCentered.x) + abs(rotatedCentered.y);
            t = fract(t * f32(repeat) + timeOffset);
            color = blend4Colors(t);
        }
        case 2: {
            // Four corners - bilinear interpolation
            var cornerSt = rotate2D(st, angle);
            let top = mix(color1, color2, cornerSt.x);
            let bottom = mix(color3, color4, cornerSt.x);
            color = mix(bottom, top, cornerSt.y);
        }
        case 3: {
            // Linear gradient along rotated y-axis
            t = rotatedSt.y;
            t = fract(t * f32(repeat) + timeOffset);
            color = blend4Colors(t);
        }
        case 4: {
            // Noise gradient with rotation
            let noiseSt = rotatedCentered * 4.0;
            t = fbmNoise(noiseSt);
            t = fract(t * f32(repeat) + timeOffset);
            color = blend4Colors(t);
        }
        case 5: {
            // Radial gradient from center
            let rotatedPoint = mat2x2<f32>(c, -s, s, c) * centered;
            let dist = length(rotatedPoint) * 2.0;
            t = dist;
            t = fract(t * f32(repeat) + timeOffset);
            color = blend4Colors(t);
        }
        case 6: {
            // Spiral gradient - angle + distance
            let a = atan2(rotatedCentered.y, rotatedCentered.x);
            let dist = length(centered);
            t = fract(a / TAU + dist * 2.0);
            t = fract(t * f32(repeat) + timeOffset);
            color = blend4Colors(t);
        }
        default: {
            color = color1;
        }
    }
    
    return vec4<f32>(color, 1.0);
}
