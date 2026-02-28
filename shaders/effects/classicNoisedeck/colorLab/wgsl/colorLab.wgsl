/*
 * Color lab shader.
 * Offers HSL, RGB, and curve adjustments in a single pass for rapid color grading.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

// Uniform struct matching runtime packing exactly
// Global uniforms first, then effect params in definition order
struct Uniforms {
    time: f32,           // offset 0
    deltaTime: f32,      // offset 4
    frame: i32,          // offset 8
    _pad0: f32,          // offset 12 (padding for vec2 alignment to 16)
    resolution: vec2f,   // offset 16 (8-byte aligned)
    aspect: f32,         // offset 24
    // effect params:
    colorMode: i32,      // offset 28
    palette: i32,        // offset 32
    paletteMode: i32,    // offset 36
    _pad1: f32,          // offset 40
    _pad2: f32,          // offset 44 (padding for vec3f alignment to 48)
    paletteOffset: vec3f, // offset 48 (16-byte aligned, 12 bytes used + 4 pad)
    _padOff: f32,        // padding to 16 bytes
    paletteAmp: vec3f,   // offset 64
    _padAmp: f32,
    paletteFreq: vec3f,  // offset 80
    _padFreq: f32,
    palettePhase: vec3f, // offset 96
    _padPhase: f32,
    cyclePalette: i32,   // offset 112
    rotatePalette: f32,  // offset 116
    repeatPalette: i32,  // offset 120
    hueRotation: f32,    // offset 124
    hueRange: f32,       // offset 128
    saturation: f32,     // offset 132
    invert: i32,         // offset 136
    brightness: i32,     // offset 140
    contrast: i32,       // offset 144
    levels: i32,         // offset 148
    dither: i32,         // offset 152
}

@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// PCG PRNG
fn pcg3(v_in: vec3u) -> vec3u {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p: vec3f) -> vec3f {
    return vec3f(pcg3(vec3u(p))) / f32(0xffffffffu);
}

fn random(st: vec2f) -> f32 {
    return prng(vec3f(st, 1.0)).x;
}

fn mapVal(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn posterize(color: vec3f, lev: f32) -> vec3f {
    if (lev == 0.0) {
        return color;
    }
    var lvl = lev;
    if (lvl == 1.0) {
        lvl = 2.0;
    }
    let gamma = 0.65;
    var c = pow(color, vec3f(gamma));
    c = floor(c * lvl) / lvl;
    c = pow(c, vec3f(1.0 / gamma));
    return c;
}

fn brightnessContrast(color: vec3f) -> vec3f {
    let bright = mapVal(f32(u.brightness), -100.0, 100.0, -1.0, 1.0);
    let cont = mapVal(f32(u.contrast), 0.0, 100.0, 0.0, 2.0);
    return (color - 0.5) * cont + 0.5 + bright;
}

fn saturateColor(color: vec3f) -> vec3f {
    let sat = mapVal(u.saturation, -100.0, 100.0, -1.0, 1.0);
    let avg = (color.r + color.g + color.b) / 3.0;
    return color - (avg - color) * sat;
}

fn periodicFunction(p: f32) -> f32 {
    let x = TAU * p;
    return mapVal(sin(x), -1.0, 1.0, 0.0, 1.0);
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
    let m = v - c;

    var rgb: vec3f;
    if (h < 1.0/6.0) {
        rgb = vec3f(c, x, 0.0);
    } else if (h < 2.0/6.0) {
        rgb = vec3f(x, c, 0.0);
    } else if (h < 3.0/6.0) {
        rgb = vec3f(0.0, c, x);
    } else if (h < 4.0/6.0) {
        rgb = vec3f(0.0, x, c);
    } else if (h < 5.0/6.0) {
        rgb = vec3f(x, 0.0, c);
    } else {
        rgb = vec3f(c, 0.0, x);
    }

    return rgb + vec3f(m, m, m);
}

fn rgb2hsv(rgb: vec3f) -> vec3f {
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;
    
    let maxC = max(r, max(g, b));
    let minC = min(r, min(g, b));
    let delta = maxC - minC;

    var h: f32 = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = ((g - b) / delta) % 6.0 / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    if (h < 0.0) { h = h + 1.0; }

    var s: f32 = 0.0;
    if (maxC != 0.0) {
        s = delta / maxC;
    }
    let v = maxC;

    return vec3f(h, s, v);
}

fn linearToSrgb(linear: vec3f) -> vec3f {
    var srgb: vec3f;
    if (linear.r <= 0.0031308) { srgb.r = linear.r * 12.92; } 
    else { srgb.r = 1.055 * pow(linear.r, 1.0 / 2.4) - 0.055; }
    if (linear.g <= 0.0031308) { srgb.g = linear.g * 12.92; }
    else { srgb.g = 1.055 * pow(linear.g, 1.0 / 2.4) - 0.055; }
    if (linear.b <= 0.0031308) { srgb.b = linear.b * 12.92; }
    else { srgb.b = 1.055 * pow(linear.b, 1.0 / 2.4) - 0.055; }
    return srgb;
}

fn srgbToLinear(srgb: vec3f) -> vec3f {
    var linear: vec3f;
    if (srgb.r <= 0.04045) { linear.r = srgb.r / 12.92; }
    else { linear.r = pow((srgb.r + 0.055) / 1.055, 2.4); }
    if (srgb.g <= 0.04045) { linear.g = srgb.g / 12.92; }
    else { linear.g = pow((srgb.g + 0.055) / 1.055, 2.4); }
    if (srgb.b <= 0.04045) { linear.b = srgb.b / 12.92; }
    else { linear.b = pow((srgb.b + 0.055) / 1.055, 2.4); }
    return linear;
}

// oklab transform
fn linear_srgb_from_oklab(c: vec3f) -> vec3f {
    let fwdA = mat3x3f(
        1.0, 1.0, 1.0,
        0.3963377774, -0.1055613458, -0.0894841775,
        0.2158037573, -0.0638541728, -1.2914855480
    );
    let fwdB = mat3x3f(
        4.0767245293, -1.2681437731, -0.0041119885,
        -3.3072168827, 2.6093323231, -0.7034763098,
        0.2307590544, -0.3411344290, 1.7068625689
    );
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

fn pal(t_in: f32) -> vec3f {
    let a = u.paletteOffset;
    let b = u.paletteAmp;
    let c = u.paletteFreq;
    let d = u.palettePhase;

    let t = t_in * f32(u.repeatPalette) + u.rotatePalette * 0.01;
    var color = a + b * cos(6.28318 * (c * t + d));

    if (u.paletteMode == 1) {
        color = hsv2rgb(color);
    } else if (u.paletteMode == 2) {
        color.y = color.y * -0.509 + 0.276;
        color.z = color.z * -0.509 + 0.198;
        color = linear_srgb_from_oklab(color);
        color = linearToSrgb(color);
    }

    return color;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var uv = fragCoord.xy / u.resolution;

    var color = textureSample(inputTex, samp, uv);

    if (f32(u.levels) != 0.0) {
        color = vec4f(posterize(color.rgb, f32(u.levels)), color.a);
    }

    let bright = rgb2hsv(color.rgb).b;

    if (u.dither == 1) {
        color = vec4f(color.rgb * vec3f(step(0.5, bright)), color.a);
    } else if (u.dither == 2) {
        color = vec4f(color.rgb * vec3f(step(random(fragCoord.xy), bright)), color.a);
    } else if (u.dither == 3) {
        color = vec4f(color.rgb * vec3f(step(periodicFunction(random(fragCoord.xy) + u.time), bright)), color.a);
    } else if (u.dither == 4) {
        let coord = (fragCoord.xy % 4.0) - 0.5;
        if (bright < 0.12) {
            color = vec4f(vec3f(0.0), color.a);
        } else if (bright < 0.24) {
            if (coord.x == 1.0 && coord.y == 1.0) { } else { color = vec4f(vec3f(0.0), color.a); }
        } else if (bright < 0.36) {
            if ((coord.x == 1.0 && coord.y == 1.0) || (coord.x == 3.0 && coord.y == 3.0)) { } else { color = vec4f(vec3f(0.0), color.a); }
        } else if (bright < 0.48) {
            if ((coord.x == 1.0 || coord.x == 3.0) && (coord.y == 1.0 || coord.y == 3.0)) { } else { color = vec4f(vec3f(0.0), color.a); }
        } else if (bright < 0.60) {
            if ((coord.x == 1.0 || coord.x == 3.0) && (coord.y == 1.0 || coord.y == 3.0)) { color = vec4f(vec3f(0.0), color.a); }
        } else if (bright < 0.72) {
            if ((coord.x == 1.0 && coord.y == 1.0) || (coord.x == 3.0 && coord.y == 3.0)) { color = vec4f(vec3f(0.0), color.a); }
        } else if (bright < 0.84) {
            if (coord.x == 1.0 && coord.y == 1.0) { color = vec4f(vec3f(0.0), color.a); }
        }
    }

    // color mode
    if (u.colorMode == 0) {
        color = vec4f(vec3f(rgb2hsv(color.rgb).b), color.a);
    } else if (u.colorMode == 1) {
        color = vec4f(srgbToLinear(color.rgb), color.a);
    } else if (u.colorMode == 3) {
        var c = color.rgb;
        c.g = c.g * -0.509 + 0.276;
        c.b = c.b * -0.509 + 0.198;
        c = linear_srgb_from_oklab(c);
        c = linearToSrgb(c);
        color = vec4f(c, color.a);
    } else if (u.colorMode == 4) {
        var d = rgb2hsv(color.rgb).b;
        if (u.cyclePalette == -1) {
            d += u.time;
        } else if (u.cyclePalette == 1) {
            d -= u.time;
        }
        color = vec4f(pal(d), color.a);
    }

    var hsv = rgb2hsv(color.rgb);
    hsv.x = (hsv.x * mapVal(u.hueRange, 0.0, 200.0, 0.0, 2.0) + (u.hueRotation / 360.0)) % 1.0;
    color = vec4f(hsv2rgb(hsv), color.a);

    if (u.invert != 0) {
        color = vec4f(vec3f(1.0) - color.rgb, color.a);
    }

    color = vec4f(brightnessContrast(color.rgb), color.a);
    color = vec4f(saturateColor(color.rgb), color.a);

    return color;
}
