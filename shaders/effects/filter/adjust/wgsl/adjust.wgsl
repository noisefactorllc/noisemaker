/*
 * Combined color adjustment effect
 * Colorspace reinterpretation + hue/saturation + brightness/contrast
 */

struct Uniforms {
    mode: i32,
    rotation: f32,
    hueRange: f32,
    saturation: f32,
    brightness: f32,
    contrast: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.28318530718;

fn mapVal(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

// --- Colorspace functions ---

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    let c = v * s;
    let x = c * (1.0 - abs(floorMod(h * 6.0, 2.0) - 1.0));
    let m = v - c;
    var rgb: vec3<f32>;
    if (h < 1.0/6.0) { rgb = vec3<f32>(c, x, 0.0); }
    else if (h < 2.0/6.0) { rgb = vec3<f32>(x, c, 0.0); }
    else if (h < 3.0/6.0) { rgb = vec3<f32>(0.0, c, x); }
    else if (h < 4.0/6.0) { rgb = vec3<f32>(0.0, x, c); }
    else if (h < 5.0/6.0) { rgb = vec3<f32>(x, 0.0, c); }
    else { rgb = vec3<f32>(c, 0.0, x); }
    return rgb + m;
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let r = rgb.r; let g = rgb.g; let b = rgb.b;
    let maxC = max(r, max(g, b));
    let minC = min(r, min(g, b));
    let delta = maxC - minC;

    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = floorMod((g - b) / delta, 6.0) / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    var s = 0.0;
    if (maxC != 0.0) { s = delta / maxC; }
    return vec3<f32>(h, s, maxC);
}

// OKLab to linear sRGB matrices
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

fn linear_srgb_from_oklab(c: vec3<f32>) -> vec3<f32> {
    let lms = fwdA * c;
    return fwdB * (lms * lms * lms);
}

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb: vec3<f32>;
    for (var i: i32 = 0; i < 3; i = i + 1) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    var color = textureSample(inputTex, inputSampler, uv);

    // --- Colorspace reinterpretation ---
    if (uniforms.mode == 1) {
        // HSV
        color = vec4<f32>(hsv2rgb(color.rgb), color.a);
    } else if (uniforms.mode == 2) {
        // OKLab
        var lab = color.rgb;
        lab.g = lab.g * -0.509 + 0.276;
        lab.b = lab.b * -0.509 + 0.198;
        var rgb = linear_srgb_from_oklab(lab);
        rgb = linearToSrgb(rgb);
        color = vec4<f32>(rgb, color.a);
    } else if (uniforms.mode == 3) {
        // OKLCH - interpret RGB as L, C, H
        let L = color.r;
        let C = color.g * 0.4;
        let H = color.b * TAU;
        let a = C * cos(H);
        let b = C * sin(H);
        var rgb = linear_srgb_from_oklab(vec3<f32>(L, a, b));
        rgb = linearToSrgb(rgb);
        color = vec4<f32>(rgb, color.a);
    }

    // --- Hue / Saturation ---
    var hsv = rgb2hsv(color.rgb);
    hsv.x = fract(hsv.x * mapVal(uniforms.hueRange, 0.0, 200.0, 0.0, 2.0) + (uniforms.rotation / 360.0));
    hsv.y = hsv.y * uniforms.saturation;
    color = vec4<f32>(hsv2rgb(hsv), color.a);

    // --- Brightness / Contrast ---
    color = vec4<f32>(color.rgb * uniforms.brightness, color.a);
    let contrastFactor = uniforms.contrast * 2.0;
    color = vec4<f32>((color.rgb - 0.5) * contrastFactor + 0.5, color.a);

    return color;
}
