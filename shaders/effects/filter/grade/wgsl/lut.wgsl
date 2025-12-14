/*
 * Grade - LUT Pass (WGSL)
 * Apply 3D color lookup table for film looks
 * Includes procedural preset LUTs
 */

struct Uniforms {
    gradeLutPreset: i32,
    gradeLutIntensity: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

// sRGB to linear
fn srgbToLinear(srgb: vec3f) -> vec3f {
    var linear: vec3f;
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
fn linearToSrgb(linear: vec3f) -> vec3f {
    var srgb: vec3f;
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
fn rgbToHsl(rgb: vec3f) -> vec3f {
    let maxC = max(max(rgb.r, rgb.g), rgb.b);
    let minC = min(min(rgb.r, rgb.g), rgb.b);
    let delta = maxC - minC;
    let l = (maxC + minC) * 0.5;
    var h = 0.0;
    var s = 0.0;
    if (delta > 0.001) {
        s = select(delta / (maxC + minC), delta / (2.0 - maxC - minC), l > 0.5);
        if (maxC == rgb.r) {
            h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b);
        } else if (maxC == rgb.g) {
            h = (rgb.b - rgb.r) / delta + 2.0;
        } else {
            h = (rgb.r - rgb.g) / delta + 4.0;
        }
        h /= 6.0;
    }
    return vec3f(h, s, l);
}

// HSL to RGB
fn hue2rgb(p: f32, q: f32, t_in: f32) -> f32 {
    var t = t_in;
    if (t < 0.0) { t += 1.0; }
    if (t > 1.0) { t -= 1.0; }
    if (t < 1.0/6.0) { return p + (q - p) * 6.0 * t; }
    if (t < 1.0/2.0) { return q; }
    if (t < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - t) * 6.0; }
    return p;
}

fn hslToRgb(hsl: vec3f) -> vec3f {
    if (hsl.y == 0.0) { return vec3f(hsl.z); }
    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;
    return vec3f(
        hue2rgb(p, q, hsl.x + 1.0/3.0),
        hue2rgb(p, q, hsl.x),
        hue2rgb(p, q, hsl.x - 1.0/3.0)
    );
}

// Luminance
fn luma(rgb: vec3f) -> f32 {
    return dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
}

// --- PROCEDURAL LUT PRESETS ---

fn lutTealOrange(rgb: vec3f) -> vec3f {
    let l = luma(rgb);
    let teal = vec3f(0.0, 0.5, 0.6);
    let orange = vec3f(1.0, 0.6, 0.3);
    let graded = mix(teal, orange, l);
    let hsl = rgbToHsl(rgb);
    var gradedHsl = rgbToHsl(graded);
    gradedHsl.y = mix(gradedHsl.y, hsl.y, 0.5);
    return hslToRgb(gradedHsl);
}

fn lutWarmFilm(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in * 0.95 + 0.05;
    rgb.r = pow(rgb.r, 0.95);
    rgb.b = pow(rgb.b, 1.05);
    let l = luma(rgb);
    rgb.g = mix(rgb.g * 0.95, rgb.g, l);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return rgb;
}

fn lutCoolShadows(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    let l = luma(rgb);
    let coolBlue = vec3f(0.4, 0.5, 0.7);
    let shadowMask = 1.0 - smoothstep(0.0, 0.5, l);
    rgb = mix(rgb, coolBlue * l * 2.0, shadowMask * 0.4);
    return rgb;
}

fn lutBleachBypass(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    let l = luma(rgb);
    let desat = vec3f(l);
    rgb = mix(rgb, desat, 0.5);
    rgb = (rgb - 0.5) * 1.3 + 0.5;
    rgb.r *= 1.02;
    rgb.b *= 0.98;
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

fn lutCrossProcess(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    rgb.r = pow(rgb.r, 0.9);
    rgb.g = pow(rgb.g, 1.0);
    rgb.b = pow(rgb.b, 1.2);
    let l = luma(rgb);
    rgb.r += (1.0 - l) * -0.1 + l * 0.1;
    rgb.g += (1.0 - l) * 0.05;
    rgb.b += (1.0 - l) * 0.1 + l * -0.15;
    var hsl = rgbToHsl(rgb);
    hsl.y *= 1.2;
    rgb = hslToRgb(hsl);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

fn lutCinematic(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    let l = luma(rgb);
    rgb = rgb * 0.9 + 0.03;
    let shadowTint = vec3f(0.95, 1.0, 1.05);
    let highlightTint = vec3f(1.05, 1.0, 0.95);
    rgb *= mix(shadowTint, highlightTint, l);
    rgb = pow(rgb, vec3f(1.1));
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

fn lutDayForNight(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    rgb.r *= 0.5;
    rgb.g *= 0.6;
    rgb.b *= 1.0;
    rgb *= 0.4;
    rgb = mix(vec3f(luma(rgb)), rgb, 0.7);
    return rgb;
}

fn lutVintage(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in * 0.85 + 0.08;
    rgb.r = pow(rgb.r, 0.95);
    rgb.b = pow(rgb.b, 1.1);
    var hsl = rgbToHsl(rgb);
    hsl.y *= 0.7;
    rgb = hslToRgb(hsl);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Noir - high contrast black and white with subtle blue shadows
fn lutNoir(rgb_in: vec3f) -> vec3f {
    let l = luma(rgb_in);
    let contrast = (l - 0.5) * 1.5 + 0.5;
    let blue = vec3f(0.9, 0.95, 1.0);
    var rgb = vec3f(contrast) * mix(blue, vec3f(1.0), contrast);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Sepia - warm brown vintage look
fn lutSepia(rgb_in: vec3f) -> vec3f {
    let l = luma(rgb_in);
    let sepia = vec3f(1.0, 0.89, 0.71);
    var rgb = l * sepia;
    rgb = rgb * 0.9 + 0.05;
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Infrared - false color heat map style
fn lutInfrared(rgb_in: vec3f) -> vec3f {
    let l = luma(rgb_in);
    var rgb = rgb_in;
    rgb.r = pow(l, 0.7);
    rgb.g = rgb_in.g * 0.3;
    rgb.b = 1.0 - l;
    let foliage = smoothstep(0.2, 0.6, rgb_in.g) * (1.0 - abs(rgb_in.r - rgb_in.b));
    rgb.r = mix(rgb.r, 1.0, foliage * 0.7);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Technicolor - saturated three-strip film look
fn lutTechnicolor(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    rgb.r = pow(rgb.r, 0.85) * 1.1;
    rgb.g = pow(rgb.g, 1.0) * 0.95;
    rgb.b = pow(rgb.b, 0.9) * 1.05;
    var hsl = rgbToHsl(rgb);
    hsl.y = min(hsl.y * 1.4, 1.0);
    rgb = hslToRgb(hsl);
    rgb = (rgb - 0.5) * 1.15 + 0.5;
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Neon - cyberpunk high saturation with color shift
fn lutNeon(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    var hsl = rgbToHsl(rgb);
    hsl.x = fract(hsl.x + 0.05);
    hsl.y = min(hsl.y * 1.8, 1.0);
    rgb = hslToRgb(hsl);
    rgb = (rgb - 0.5) * 1.4 + 0.5;
    rgb.r = pow(max(rgb.r, 0.0), 0.9);
    rgb.b = pow(max(rgb.b, 0.0), 0.85);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Matrix - green monochrome terminal look
fn lutMatrix(rgb_in: vec3f) -> vec3f {
    let l = luma(rgb_in);
    let boosted = pow(l, 0.8);
    var rgb = vec3f(boosted * 0.2, boosted, boosted * 0.15);
    rgb += vec3f(0.0, 0.02, 0.0);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Underwater - aquatic blue-green color shift
fn lutUnderwater(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    rgb.r *= 0.5;
    rgb.g = pow(rgb.g, 0.9) * 0.9;
    rgb.b = pow(rgb.b, 0.85) * 1.1;
    let depth = 1.0 - luma(rgb_in) * 0.3;
    rgb = mix(rgb, rgb * vec3f(0.4, 0.7, 1.0), 0.3 * depth);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Sunset - warm orange/magenta gradient
fn lutSunset(rgb_in: vec3f) -> vec3f {
    var rgb = rgb_in;
    let l = luma(rgb_in);
    let warmth = smoothstep(0.3, 0.7, l);
    let sunset = mix(vec3f(1.0, 0.3, 0.5), vec3f(1.0, 0.8, 0.4), warmth);
    rgb = mix(rgb * sunset, rgb, 0.4);
    rgb.r = pow(rgb.r, 0.9);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

// Monochrome - pure black and white with enhanced contrast
fn lutMonochrome(rgb_in: vec3f) -> vec3f {
    let l = luma(rgb_in);
    let contrast = (l - 0.5) * 1.2 + 0.5;
    return clamp(vec3f(contrast), vec3f(0.0), vec3f(1.0));
}

// Psychedelic - extreme color rotation and saturation
fn lutPsychedelic(rgb_in: vec3f) -> vec3f {
    var hsl = rgbToHsl(rgb_in);
    hsl.x = fract(hsl.x * 3.0 + hsl.z * 0.5);
    hsl.y = min(hsl.y * 2.0, 1.0);
    hsl.z = (hsl.z - 0.5) * 1.3 + 0.5;
    var rgb = hslToRgb(hsl);
    return clamp(rgb, vec3f(0.0), vec3f(1.0));
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let coord = vec2i(fragCoord.xy);
    let color = textureLoad(inputTex, coord, 0);
    
    if (uniforms.gradeLutPreset == 0 || uniforms.gradeLutIntensity <= 0.0) {
        return color;
    }
    
    var rgb = srgbToLinear(color.rgb);
    var graded = rgb;
    
    if (uniforms.gradeLutPreset == 1) {
        graded = lutTealOrange(rgb);
    } else if (uniforms.gradeLutPreset == 2) {
        graded = lutWarmFilm(rgb);
    } else if (uniforms.gradeLutPreset == 3) {
        graded = lutCoolShadows(rgb);
    } else if (uniforms.gradeLutPreset == 4) {
        graded = lutBleachBypass(rgb);
    } else if (uniforms.gradeLutPreset == 5) {
        graded = lutCrossProcess(rgb);
    } else if (uniforms.gradeLutPreset == 6) {
        graded = lutCinematic(rgb);
    } else if (uniforms.gradeLutPreset == 7) {
        graded = lutDayForNight(rgb);
    } else if (uniforms.gradeLutPreset == 8) {
        graded = lutVintage(rgb);
    } else if (uniforms.gradeLutPreset == 9) {
        graded = lutNoir(rgb);
    } else if (uniforms.gradeLutPreset == 10) {
        graded = lutSepia(rgb);
    } else if (uniforms.gradeLutPreset == 11) {
        graded = lutInfrared(rgb);
    } else if (uniforms.gradeLutPreset == 12) {
        graded = lutTechnicolor(rgb);
    } else if (uniforms.gradeLutPreset == 13) {
        graded = lutNeon(rgb);
    } else if (uniforms.gradeLutPreset == 14) {
        graded = lutMatrix(rgb);
    } else if (uniforms.gradeLutPreset == 15) {
        graded = lutUnderwater(rgb);
    } else if (uniforms.gradeLutPreset == 16) {
        graded = lutSunset(rgb);
    } else if (uniforms.gradeLutPreset == 17) {
        graded = lutMonochrome(rgb);
    } else if (uniforms.gradeLutPreset == 18) {
        graded = lutPsychedelic(rgb);
    }
    
    rgb = mix(rgb, graded, uniforms.gradeLutIntensity);
    rgb = linearToSrgb(max(rgb, vec3f(0.0)));
    
    return vec4f(rgb, color.a);
}
