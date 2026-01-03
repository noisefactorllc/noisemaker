// Palette mapping shader.
// Recolors the input feed by projecting luminance into configurable palette ramps.
// Ported from GLSL to WGSL

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;

struct Uniforms {
    time: f32,
    seed: i32,
    paletteType: i32,
    cyclePalette: i32,
    rotatePalette: f32,
    smoother: i32,
    color1: vec3<f32>,
    _pad1: f32,
    color2: vec3<f32>,
    _pad2: f32,
    color3: vec3<f32>,
    _pad3: f32,
    color4: vec3<f32>,
    _pad4: f32,
    color5: vec3<f32>,
    _pad5: f32,
    tint: vec3<f32>,
    _pad6: f32,
    offsetR: f32,
    offsetG: f32,
    offsetB: f32,
    phaseR: f32,
    phaseG: f32,
    phaseB: f32,
    ampR: f32,
    ampG: f32,
    ampB: f32,
    freq: f32,
    colorMode: i32,
}

@group(0) @binding(2) var<uniform> u : Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn luminance(color: vec3<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn colorize(v_in: f32, c1: vec3<f32>, c2: vec3<f32>, c3: vec3<f32>, c4: vec3<f32>, c5: vec3<f32>) -> vec3<f32> {
    var v = v_in * u.freq;
    v = v % 1.0;
    if (v < 0.0) { v = v + 1.0; }
    
    // unsmooth pass
    var color: vec3<f32>;
    let idx = i32(((v + 0.1) % 1.0) * 5.0);
    
    if (idx == 0) { color = c1; }
    else if (idx == 1) { color = c2; }
    else if (idx == 2) { color = c3; }
    else if (idx == 3) { color = c4; }
    else { color = c5; }
    
    // smoothing pass
    var s = fwidth(v) * 0.75;
    if (s > 0.1) { s = 0.1; }
    
    if (v <= s || v >= 1.0 - s) {
        color = c1;
    } else if (v >= 0.1 - s && v <= 0.1 + s) {
        color = mix(c1, c2, smoothstep(0.1 - s, 0.1 + s, v));
    } else if (v >= 0.3 - s && v <= 0.3 + s) {
        color = mix(c2, c3, smoothstep(0.3 - s, 0.3 + s, v));
    } else if (v >= 0.5 - s && v <= 0.5 + s) {
        color = mix(c3, c4, smoothstep(0.5 - s, 0.5 + s, v));
    } else if (v >= 0.7 - s && v <= 0.7 + s) {
        color = mix(c4, c5, smoothstep(0.7 - s, 0.7 + s, v));
    } else if (v >= 0.9 - s && v <= 0.9 + s) {
        color = mix(c5, c1, smoothstep(0.9 - s, 0.9 + s, v));
    }
    
    return color;
}

fn smoothColorize(v_in: f32, c1: vec3<f32>, c2: vec3<f32>, c3: vec3<f32>, c4: vec3<f32>, c5: vec3<f32>) -> vec3<f32> {
    var v = v_in * u.freq;
    v = v % 1.0;
    if (v < 0.0) { v = v + 1.0; }
    
    var color = vec3<f32>(1.0);
    
    if (v <= 0.2) {
        color = mix(c1, c2, v * 5.0);
    } else if (v <= 0.4) {
        color = mix(c2, c3, (v - 0.2) * 5.0);
    } else if (v <= 0.6) {
        color = mix(c3, c4, (v - 0.4) * 5.0);
    } else if (v <= 0.8) {
        color = mix(c4, c5, (v - 0.6) * 5.0);
    } else {
        color = mix(c5, c1, (v - 0.8) * 5.0);
    }
    
    return color;
}

fn pal(t_in: f32) -> vec3<f32> {
    let t = fract(t_in + u.rotatePalette * 0.01);
    let a = vec3<f32>(u.offsetR, u.offsetG, u.offsetB) * 0.01;
    let b = vec3<f32>(u.ampR, u.ampG, u.ampB) * 0.01;
    let c = vec3<f32>(u.freq);
    let d = vec3<f32>(u.phaseR, u.phaseG, u.phaseB) * 0.01;
    
    return a + b * cos(6.28318 * (c * t + d));
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s; // Chroma
    let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
    let m = v - c;
    
    var rgb: vec3<f32>;
    
    if (h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }
    
    return rgb + vec3<f32>(m, m, m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;
    
    let maxC = max(r, max(g, b));
    let minC = min(r, min(g, b));
    let delta = maxC - minC;
    
    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = ((g - b) / delta) % 6.0;
            if (h < 0.0) { h = h + 6.0; }
            h = h / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    
    var s = 0.0;
    if (maxC != 0.0) {
        s = delta / maxC;
    }
    let v = maxC;
    
    return vec3<f32>(h, s, v);
}

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb: vec3<f32>;
    
    if (linear.x <= 0.0031308) {
        srgb.x = linear.x * 12.92;
    } else {
        srgb.x = 1.055 * pow(linear.x, 1.0 / 2.4) - 0.055;
    }
    
    if (linear.y <= 0.0031308) {
        srgb.y = linear.y * 12.92;
    } else {
        srgb.y = 1.055 * pow(linear.y, 1.0 / 2.4) - 0.055;
    }
    
    if (linear.z <= 0.0031308) {
        srgb.z = linear.z * 12.92;
    } else {
        srgb.z = 1.055 * pow(linear.z, 1.0 / 2.4) - 0.055;
    }
    
    return srgb;
}

// oklab matrices
const fwdA = mat3x3<f32>(
    vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.3963377774, -0.1055613458, -0.0894841775),
    vec3<f32>(0.2158037573, -0.0638541728, -1.2914855480)
);

const fwdB = mat3x3<f32>(
    vec3<f32>(4.0767245293, -1.2681437731, -0.0041119885),
    vec3<f32>(-3.3072168827, 2.6093323231, -0.7034763098),
    vec3<f32>(0.2307590544, -0.3411344290, 1.7068625689)
);

const invB = mat3x3<f32>(
    vec3<f32>(0.4121656120, 0.2118591070, 0.0883097947),
    vec3<f32>(0.5362752080, 0.6807189584, 0.2818474174),
    vec3<f32>(0.0514575653, 0.1074065790, 0.6302613616)
);

const invA = mat3x3<f32>(
    vec3<f32>(0.2104542553, 1.9779984951, 0.0259040371),
    vec3<f32>(0.7936177850, -2.4285922050, 0.7827717662),
    vec3<f32>(-0.0040720468, 0.4505937099, -0.8086757660)
);

fn oklab_from_linear_srgb(c: vec3<f32>) -> vec3<f32> {
    let lms = invB * c;
    return invA * (sign(lms) * pow(abs(lms), vec3<f32>(0.3333333333333)));
}

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var uv = fragCoord.xy / dims;
    uv.y = 1.0 - uv.y;
    
    var color = textureSample(inputTex, samp, uv);
    
    if (u.paletteType == 0) {
        var d = luminance(color.rgb) * 0.9; // prevent black and white from returning the same color
        
        if (u.cyclePalette == -1) {
            color = vec4<f32>(pal(d + u.time), color.a);
        } else if (u.cyclePalette == 1) {
            color = vec4<f32>(pal(d - u.time), color.a);
        } else {
            color = vec4<f32>(pal(d), color.a);
        }
        
        if (u.colorMode == 0) {
            // hsv -> rgb conversion
            color = vec4<f32>(hsv2rgb(color.rgb), color.a);
        } else if (u.colorMode == 1) {
            // oklab -> rgb conversion
            var lab = color.rgb;
            lab.g = lab.g * -0.509 + 0.276;
            lab.b = lab.b * -0.509 + 0.198;
            color = vec4<f32>(linearToSrgb(linear_srgb_from_oklab(lab)), color.a);
        }
    } else if (u.paletteType == 1) {
        let l = luminance(color.rgb) + u.rotatePalette * 0.01;
        
        if (u.smoother != 0) {
            color = vec4<f32>(smoothColorize(l, u.color1, u.color2, u.color3, u.color4, u.color5), color.a);
        } else {
            color = vec4<f32>(colorize(l, u.color1, u.color2, u.color3, u.color4, u.color5), color.a);
        }
        
        // Tint blend
        var tinted = color.rgb;
        for (var i = 0; i < 3; i = i + 1) {
            if (color.rgb[i] == 1.0) {
                tinted[i] = color.rgb[i];
            } else {
                tinted[i] = min(u.tint[i] * u.tint[i] / (1.0 - color.rgb[i]), 1.0);
            }
        }
        color = vec4<f32>(mix(color.rgb, tinted, 0.5), color.a);
        
        if (u.cyclePalette == -1) {
            var hsv = rgb2hsv(color.rgb);
            hsv.x = (hsv.x + u.time) % 1.0;
            if (hsv.x < 0.0) { hsv.x = hsv.x + 1.0; }
            color = vec4<f32>(hsv2rgb(hsv), color.a);
        } else if (u.cyclePalette == 1) {
            var hsv = rgb2hsv(color.rgb);
            hsv.x = (hsv.x - u.time) % 1.0;
            if (hsv.x < 0.0) { hsv.x = hsv.x + 1.0; }
            color = vec4<f32>(hsv2rgb(hsv), color.a);
        }
    }
    
    return color;
}
