/*
 * Grade - LUT Pass
 * Apply 3D color lookup table for film looks
 * Includes procedural preset LUTs
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int gradePreset;      // 0=none, 1=tealOrange, 2=warmFilm, 3=coolShadows, 4=bleachBypass, 5=crossProcess
uniform float gradeAlpha; // 0-1 blend with original

out vec4 fragColor;

// sRGB to linear
vec3 srgbToLinear(vec3 srgb) {
    vec3 linear;
    for (int i = 0; i < 3; i++) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

// Linear to sRGB
vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; i++) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// RGB to HSL
vec3 rgbToHsl(vec3 rgb) {
    float maxC = max(max(rgb.r, rgb.g), rgb.b);
    float minC = min(min(rgb.r, rgb.g), rgb.b);
    float delta = maxC - minC;
    float l = (maxC + minC) * 0.5;
    float h = 0.0, s = 0.0;
    if (delta > 0.001) {
        s = (l > 0.5) ? delta / (2.0 - maxC - minC) : delta / (maxC + minC);
        if (maxC == rgb.r) h = (rgb.g - rgb.b) / delta + (rgb.g < rgb.b ? 6.0 : 0.0);
        else if (maxC == rgb.g) h = (rgb.b - rgb.r) / delta + 2.0;
        else h = (rgb.r - rgb.g) / delta + 4.0;
        h /= 6.0;
    }
    return vec3(h, s, l);
}

// HSL to RGB
float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
}

vec3 hslToRgb(vec3 hsl) {
    if (hsl.y == 0.0) return vec3(hsl.z);
    float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
    float p = 2.0 * hsl.z - q;
    return vec3(
        hue2rgb(p, q, hsl.x + 1.0/3.0),
        hue2rgb(p, q, hsl.x),
        hue2rgb(p, q, hsl.x - 1.0/3.0)
    );
}

// Luminance
float luma(vec3 rgb) {
    return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
}

// --- PROCEDURAL LUT PRESETS ---

// Teal & Orange - Hollywood blockbuster look
vec3 lutTealOrange(vec3 rgb) {
    float l = luma(rgb);
    
    // Push shadows toward teal, highlights toward orange
    vec3 teal = vec3(0.0, 0.5, 0.6);
    vec3 orange = vec3(1.0, 0.6, 0.3);
    
    // Blend based on luminance
    vec3 graded = mix(teal, orange, l);
    
    // Preserve original saturation somewhat
    vec3 hsl = rgbToHsl(rgb);
    vec3 gradedHsl = rgbToHsl(graded);
    gradedHsl.y = mix(gradedHsl.y, hsl.y, 0.5);
    
    return hslToRgb(gradedHsl);
}

// Warm Film - Kodak Portra-like warmth
vec3 lutWarmFilm(vec3 rgb) {
    // Lift shadows slightly
    rgb = rgb * 0.95 + 0.05;
    
    // Warm midtones
    rgb.r = pow(rgb.r, 0.95);
    rgb.b = pow(rgb.b, 1.05);
    
    // Reduce green in shadows
    float l = luma(rgb);
    rgb.g = mix(rgb.g * 0.95, rgb.g, l);
    
    // Slight S-curve
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    
    return rgb;
}

// Cool Shadows - Moonlight/twilight look
vec3 lutCoolShadows(vec3 rgb) {
    float l = luma(rgb);
    
    // Cool shadows, neutral highlights
    vec3 coolBlue = vec3(0.4, 0.5, 0.7);
    
    // Only affect shadows
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, l);
    rgb = mix(rgb, coolBlue * l * 2.0, shadowMask * 0.4);
    
    return rgb;
}

// Bleach Bypass - Desaturated high contrast
vec3 lutBleachBypass(vec3 rgb) {
    float l = luma(rgb);
    
    // Desaturate
    vec3 desat = vec3(l);
    rgb = mix(rgb, desat, 0.5);
    
    // Increase contrast
    rgb = (rgb - 0.5) * 1.3 + 0.5;
    
    // Slight warm tint
    rgb.r *= 1.02;
    rgb.b *= 0.98;
    
    return clamp(rgb, 0.0, 1.0);
}

// Cross Process - Vintage film cross-processing
vec3 lutCrossProcess(vec3 rgb) {
    // Shift color channels
    rgb.r = pow(rgb.r, 0.9);
    rgb.g = pow(rgb.g, 1.0);
    rgb.b = pow(rgb.b, 1.2);
    
    // Add cyan to shadows, yellow to highlights
    float l = luma(rgb);
    rgb.r += (1.0 - l) * -0.1 + l * 0.1;
    rgb.g += (1.0 - l) * 0.05;
    rgb.b += (1.0 - l) * 0.1 + l * -0.15;
    
    // Boost saturation
    vec3 hsl = rgbToHsl(rgb);
    hsl.y *= 1.2;
    rgb = hslToRgb(hsl);
    
    return clamp(rgb, 0.0, 1.0);
}

// Cinematic - Film emulation with lifted blacks
vec3 lutCinematic(vec3 rgb) {
    float l = luma(rgb);
    
    // Lift blacks
    rgb = rgb * 0.9 + 0.03;
    
    // Slight teal in shadows, warm highlights
    vec3 shadowTint = vec3(0.95, 1.0, 1.05);
    vec3 highlightTint = vec3(1.05, 1.0, 0.95);
    rgb *= mix(shadowTint, highlightTint, l);
    
    // Soft contrast curve
    rgb = pow(rgb, vec3(1.1));
    
    return clamp(rgb, 0.0, 1.0);
}

// Day for Night - Simulate night from day footage
vec3 lutDayForNight(vec3 rgb) {
    float l = luma(rgb);
    
    // Strong blue push
    rgb.r *= 0.5;
    rgb.g *= 0.6;
    rgb.b *= 1.0;
    
    // Darken overall
    rgb *= 0.4;
    
    // Slight desaturation
    rgb = mix(vec3(luma(rgb)), rgb, 0.7);
    
    return rgb;
}

// Vintage - Faded retro look
vec3 lutVintage(vec3 rgb) {
    // Fade blacks
    rgb = rgb * 0.85 + 0.08;
    
    // Warm overall tone
    rgb.r = pow(rgb.r, 0.95);
    rgb.b = pow(rgb.b, 1.1);
    
    // Reduce saturation
    vec3 hsl = rgbToHsl(rgb);
    hsl.y *= 0.7;
    rgb = hslToRgb(hsl);
    
    // Slight vignette-like falloff in saturation
    return clamp(rgb, 0.0, 1.0);
}

// Noir - High contrast black and white with hints of color
vec3 lutNoir(vec3 rgb) {
    float l = luma(rgb);
    
    // Strong contrast
    l = (l - 0.5) * 1.5 + 0.5;
    l = clamp(l, 0.0, 1.0);
    
    // Almost monochrome with slight blue tint in shadows
    vec3 blue = vec3(0.9, 0.95, 1.0);
    vec3 mono = vec3(l) * mix(blue, vec3(1.0), l);
    
    return clamp(mono, 0.0, 1.0);
}

// Sepia - Classic aged photograph
vec3 lutSepia(vec3 rgb) {
    float l = luma(rgb);
    
    // Sepia tone
    vec3 sepia = vec3(1.0, 0.89, 0.71);
    vec3 result = l * sepia;
    
    // Lift blacks slightly
    result = result * 0.9 + 0.05;
    
    return clamp(result, 0.0, 1.0);
}

// Infrared - False color infrared look
vec3 lutInfrared(vec3 rgb) {
    float l = luma(rgb);
    
    // Simulate infrared: reds become bright, greens become dark
    vec3 result;
    result.r = pow(l, 0.7);
    result.g = rgb.g * 0.3;
    result.b = 1.0 - l;
    
    // Boost foliage simulation (greens become bright red)
    float foliage = smoothstep(0.2, 0.6, rgb.g) * (1.0 - abs(rgb.r - rgb.b));
    result.r = mix(result.r, 1.0, foliage * 0.7);
    
    return clamp(result, 0.0, 1.0);
}

// Technicolor - Saturated three-strip film look
vec3 lutTechnicolor(vec3 rgb) {
    // Emulate three-strip Technicolor process
    rgb.r = pow(rgb.r, 0.85) * 1.1;
    rgb.g = pow(rgb.g, 1.0) * 0.95;
    rgb.b = pow(rgb.b, 0.9) * 1.05;
    
    // Boost saturation
    vec3 hsl = rgbToHsl(rgb);
    hsl.y = min(hsl.y * 1.4, 1.0);
    rgb = hslToRgb(hsl);
    
    // Increase contrast
    rgb = (rgb - 0.5) * 1.15 + 0.5;
    
    return clamp(rgb, 0.0, 1.0);
}

// Neon - Cyberpunk/synthwave colors
vec3 lutNeon(vec3 rgb) {
    // Shift hue and boost saturation
    vec3 hsl = rgbToHsl(rgb);
    hsl.x = mod(hsl.x + 0.05, 1.0);
    hsl.y = min(hsl.y * 1.8, 1.0);
    rgb = hslToRgb(hsl);
    
    // High contrast
    rgb = (rgb - 0.5) * 1.4 + 0.5;
    
    // Push toward magenta/cyan
    rgb.r = pow(max(rgb.r, 0.0), 0.9);
    rgb.b = pow(max(rgb.b, 0.0), 0.85);
    
    return clamp(rgb, 0.0, 1.0);
}

// Matrix - Green digital rain aesthetic
vec3 lutMatrix(vec3 rgb) {
    float l = luma(rgb);
    
    // Boost luminance
    float boosted = pow(l, 0.8);
    
    // Map to green primarily
    vec3 result = vec3(boosted * 0.2, boosted, boosted * 0.15);
    
    // Add slight glow
    result += vec3(0.0, 0.02, 0.0);
    
    return clamp(result, 0.0, 1.0);
}

// Underwater - Aquatic blue-green color shift
vec3 lutUnderwater(vec3 rgb) {
    // Reduce reds (absorbed by water)
    rgb.r *= 0.5;
    
    // Shift toward blue-green
    rgb.g = pow(rgb.g, 0.9) * 0.9;
    rgb.b = pow(rgb.b, 0.85) * 1.1;
    
    // Add depth haze
    float depth = 1.0 - luma(rgb) * 0.3;
    rgb = mix(rgb, rgb * vec3(0.4, 0.7, 1.0), 0.3 * depth);
    
    return clamp(rgb, 0.0, 1.0);
}

// Sunset - Warm golden hour tones
vec3 lutSunset(vec3 rgb) {
    float l = luma(rgb);
    
    // Golden warmth
    float warmth = smoothstep(0.3, 0.7, l);
    vec3 sunset = mix(vec3(1.0, 0.3, 0.5), vec3(1.0, 0.8, 0.4), warmth);
    rgb = mix(rgb * sunset, rgb, 0.4);
    
    // Boost reds
    rgb.r = pow(rgb.r, 0.9);
    
    return clamp(rgb, 0.0, 1.0);
}

// Monochrome - Pure black and white with enhanced contrast
vec3 lutMonochrome(vec3 rgb) {
    float l = luma(rgb);
    
    // Enhanced contrast
    l = (l - 0.5) * 1.2 + 0.5;
    
    return clamp(vec3(l), 0.0, 1.0);
}

// Psychedelic - Extreme color rotation and saturation
vec3 lutPsychedelic(vec3 rgb) {
    vec3 hsl = rgbToHsl(rgb);
    
    // Rotate hue based on luminance
    hsl.x = mod(hsl.x * 3.0 + hsl.z * 0.5, 1.0);
    
    // Extreme saturation
    hsl.y = min(hsl.y * 2.0, 1.0);
    
    // Boost contrast
    hsl.z = (hsl.z - 0.5) * 1.3 + 0.5;
    
    rgb = hslToRgb(hsl);
    
    return clamp(rgb, 0.0, 1.0);
}

// Hard Light - Extreme contrast for metallic/shiny appearance
vec3 lutHardLight(vec3 rgb) {
    float l = luma(rgb);
    
    // Hard light blend mode simulation
    vec3 result;
    for (int i = 0; i < 3; i++) {
        if (rgb[i] < 0.5) {
            result[i] = 2.0 * rgb[i] * l;
        } else {
            result[i] = 1.0 - 2.0 * (1.0 - rgb[i]) * (1.0 - l);
        }
    }
    
    // Boost overall contrast
    result = (result - 0.5) * 1.4 + 0.5;
    
    // Add slight cool metallic tint to highlights
    float highlightMask = smoothstep(0.5, 1.0, l);
    result.b += highlightMask * 0.05;
    
    return clamp(result, 0.0, 1.0);
}

// Posterize - Quantize luminance for banded noise effect
vec3 lutPosterize(vec3 rgb) {
    float l = luma(rgb);
    
    // Quantize to discrete levels
    float levels = 6.0;
    float quantized = floor(l * levels + 0.5) / levels;
    
    // Map to a color ramp for visual interest
    vec3 ramp;
    if (quantized < 0.2) {
        ramp = vec3(0.1, 0.05, 0.15);  // Deep purple-black
    } else if (quantized < 0.4) {
        ramp = vec3(0.3, 0.2, 0.4);    // Dark purple
    } else if (quantized < 0.6) {
        ramp = vec3(0.5, 0.4, 0.6);    // Medium purple
    } else if (quantized < 0.8) {
        ramp = vec3(0.8, 0.6, 0.5);    // Warm highlight
    } else {
        ramp = vec3(1.0, 0.9, 0.8);    // Bright cream
    }
    
    // Blend with original color for some hue preservation
    vec3 hsl = rgbToHsl(rgb);
    vec3 rampHsl = rgbToHsl(ramp);
    rampHsl.x = mix(rampHsl.x, hsl.x, 0.3);
    
    return hslToRgb(rampHsl);
}

// Solarize - Partial inversion creates wild band separation
vec3 lutSolarize(vec3 rgb) {
    float l = luma(rgb);
    
    // Invert values above threshold, creating bands
    float threshold = 0.5;
    vec3 result;
    for (int i = 0; i < 3; i++) {
        if (rgb[i] > threshold) {
            result[i] = 2.0 * (1.0 - rgb[i]);
        } else {
            result[i] = 2.0 * rgb[i];
        }
    }
    
    // Boost saturation for more dramatic effect
    vec3 hsl = rgbToHsl(result);
    hsl.y = min(hsl.y * 1.5, 1.0);
    result = hslToRgb(hsl);
    
    // Add slight contrast
    result = (result - 0.5) * 1.1 + 0.5;
    
    return clamp(result, 0.0, 1.0);
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Early exit if no LUT selected
    if (gradePreset == 0 || gradeAlpha <= 0.0) {
        fragColor = color;
        return;
    }
    
    vec3 rgb = srgbToLinear(color.rgb);
    vec3 graded = rgb;
    
    // Apply selected LUT preset
    if (gradePreset == 1) {
        graded = lutTealOrange(rgb);
    } else if (gradePreset == 2) {
        graded = lutWarmFilm(rgb);
    } else if (gradePreset == 3) {
        graded = lutCoolShadows(rgb);
    } else if (gradePreset == 4) {
        graded = lutBleachBypass(rgb);
    } else if (gradePreset == 5) {
        graded = lutCrossProcess(rgb);
    } else if (gradePreset == 6) {
        graded = lutCinematic(rgb);
    } else if (gradePreset == 7) {
        graded = lutDayForNight(rgb);
    } else if (gradePreset == 8) {
        graded = lutVintage(rgb);
    } else if (gradePreset == 9) {
        graded = lutNoir(rgb);
    } else if (gradePreset == 10) {
        graded = lutSepia(rgb);
    } else if (gradePreset == 11) {
        graded = lutInfrared(rgb);
    } else if (gradePreset == 12) {
        graded = lutTechnicolor(rgb);
    } else if (gradePreset == 13) {
        graded = lutNeon(rgb);
    } else if (gradePreset == 14) {
        graded = lutMatrix(rgb);
    } else if (gradePreset == 15) {
        graded = lutUnderwater(rgb);
    } else if (gradePreset == 16) {
        graded = lutSunset(rgb);
    } else if (gradePreset == 17) {
        graded = lutMonochrome(rgb);
    } else if (gradePreset == 18) {
        graded = lutPsychedelic(rgb);
    } else if (gradePreset == 20) {
        graded = lutHardLight(rgb);
    } else if (gradePreset == 21) {
        graded = lutPosterize(rgb);
    } else if (gradePreset == 22) {
        graded = lutSolarize(rgb);
    }
    
    // Blend with original based on intensity
    rgb = mix(rgb, graded, gradeAlpha);
    
    // Encode back to sRGB
    rgb = linearToSrgb(max(rgb, vec3(0.0)));
    
    fragColor = vec4(rgb, color.a);
}
