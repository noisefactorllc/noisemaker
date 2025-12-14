/*
 * Grade - HSL Secondary Pass (WGSL)
 * Isolate color range by Hue/Sat/Luma, apply targeted correction
 * Key with soft edges
 */

struct Uniforms {
    gradeHslEnable: i32,
    gradeHslHueCenter: f32,
    gradeHslHueRange: f32,
    gradeHslSatMin: f32,
    gradeHslSatMax: f32,
    gradeHslLumMin: f32,
    gradeHslLumMax: f32,
    gradeHslFeather: f32,
    gradeHslHueShift: f32,
    gradeHslSatAdjust: f32,
    gradeHslLumAdjust: f32,
    _pad0: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const LUMA_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);

// sRGB to linear
fn srgbToLinear(srgb: vec3<f32>) -> vec3<f32> {
    var linear: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

// Linear to sRGB
fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// RGB to HSL
fn rgbToHsl(rgb: vec3<f32>) -> vec3<f32> {
    let maxC = max(max(rgb.r, rgb.g), rgb.b);
    let minC = min(min(rgb.r, rgb.g), rgb.b);
    let delta = maxC - minC;
    
    let l = (maxC + minC) * 0.5;
    
    var h = 0.0;
    var s = 0.0;
    
    if (delta > 0.001) {
        if (l > 0.5) {
            s = delta / (2.0 - maxC - minC);
        } else {
            s = delta / (maxC + minC);
        }
        
        if (maxC == rgb.r) {
            h = (rgb.g - rgb.b) / delta;
            if (rgb.g < rgb.b) { h += 6.0; }
        } else if (maxC == rgb.g) {
            h = (rgb.b - rgb.r) / delta + 2.0;
        } else {
            h = (rgb.r - rgb.g) / delta + 4.0;
        }
        h /= 6.0;
    }
    
    return vec3<f32>(h, s, l);
}

// HSL to RGB
fn hslToRgb(hsl: vec3<f32>) -> vec3<f32> {
    let h = hsl.x;
    let s = hsl.y;
    let l = hsl.z;
    
    if (s < 0.001) {
        return vec3<f32>(l);
    }
    
    var q: f32;
    if (l < 0.5) {
        q = l * (1.0 + s);
    } else {
        q = l + s - l * s;
    }
    let p = 2.0 * l - q;
    
    var rgb: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        var t = h + (1.0 - f32(i)) / 3.0;
        t = fract(t);
        
        if (t < 1.0 / 6.0) {
            rgb[i] = p + (q - p) * 6.0 * t;
        } else if (t < 0.5) {
            rgb[i] = q;
        } else if (t < 2.0 / 3.0) {
            rgb[i] = p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        } else {
            rgb[i] = p;
        }
    }
    
    return rgb;
}

// Compute HSL key matte
fn computeHslKey(hsl: vec3<f32>, hueCenter: f32, hueRange: f32, 
                 satMin: f32, satMax: f32, lumMin: f32, lumMax: f32, feather: f32) -> f32 {
    var hueDist = abs(hsl.x - hueCenter);
    hueDist = min(hueDist, 1.0 - hueDist);
    
    let hueKey = 1.0 - smoothstep(hueRange - feather, hueRange + feather, hueDist);
    
    let satKey = smoothstep(satMin - feather, satMin + feather, hsl.y) *
                 (1.0 - smoothstep(satMax - feather, satMax + feather, hsl.y));
    
    let lumKey = smoothstep(lumMin - feather, lumMin + feather, hsl.z) *
                 (1.0 - smoothstep(lumMax - feather, lumMax + feather, hsl.z));
    
    return hueKey * satKey * lumKey;
}

// Apply correction
fn applyHslCorrection(hsl: vec3<f32>, hueShift: f32, satAdjust: f32, lumAdjust: f32) -> vec3<f32> {
    var corrected = hsl;
    corrected.x = fract(corrected.x + hueShift);
    corrected.y = clamp(corrected.y + satAdjust, 0.0, 1.0);
    corrected.z = clamp(corrected.z + lumAdjust * 0.5, 0.0, 1.0);
    return corrected;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let color = textureSample(inputTex, inputSampler, uv);
    
    if (uniforms.gradeHslEnable == 0) {
        return color;
    }
    
    var rgb = srgbToLinear(color.rgb);
    let hsl = rgbToHsl(rgb);
    
    let matte = computeHslKey(hsl, uniforms.gradeHslHueCenter, uniforms.gradeHslHueRange,
                              uniforms.gradeHslSatMin, uniforms.gradeHslSatMax,
                              uniforms.gradeHslLumMin, uniforms.gradeHslLumMax, 
                              uniforms.gradeHslFeather);
    
    let correctedHsl = applyHslCorrection(hsl, uniforms.gradeHslHueShift, 
                                           uniforms.gradeHslSatAdjust, uniforms.gradeHslLumAdjust);
    let correctedRgb = hslToRgb(correctedHsl);
    
    rgb = mix(rgb, correctedRgb, matte);
    
    rgb = linearToSrgb(max(rgb, vec3<f32>(0.0)));
    
    return vec4<f32>(rgb, color.a);
}
