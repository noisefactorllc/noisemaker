/*
 * Grade - HSL Secondary Pass
 * Isolate color range by Hue/Sat/Luma, apply targeted correction
 * Key with soft edges, optional refinement
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int hslEnable;
uniform float hslHueCenter;
uniform float hslHueRange;
uniform float hslSatMin;
uniform float hslSatMax;
uniform float hslLumMin;
uniform float hslLumMax;
uniform float hslFeather;
uniform float hslHueShift;
uniform float hslSatAdjust;
uniform float hslLumAdjust;

out vec4 fragColor;

const vec3 LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);
const float PI = 3.14159265359;

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
    
    float h = 0.0;
    float s = 0.0;
    
    if (delta > 0.001) {
        s = (l > 0.5) ? delta / (2.0 - maxC - minC) : delta / (maxC + minC);
        
        if (maxC == rgb.r) {
            h = (rgb.g - rgb.b) / delta + (rgb.g < rgb.b ? 6.0 : 0.0);
        } else if (maxC == rgb.g) {
            h = (rgb.b - rgb.r) / delta + 2.0;
        } else {
            h = (rgb.r - rgb.g) / delta + 4.0;
        }
        h /= 6.0;
    }
    
    return vec3(h, s, l);
}

// HSL to RGB
vec3 hslToRgb(vec3 hsl) {
    float h = hsl.x;
    float s = hsl.y;
    float l = hsl.z;
    
    if (s < 0.001) {
        return vec3(l);
    }
    
    float q = (l < 0.5) ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;
    
    vec3 rgb;
    for (int i = 0; i < 3; i++) {
        float t = h + (1.0 - float(i)) / 3.0;
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

// Compute HSL key matte with soft edges
// Returns 0-1 where 1 = fully selected
float computeHslKey(vec3 hsl, float hueCenter, float hueRange, 
                    float satMin, float satMax, float lumMin, float lumMax, float feather) {
    // Hue key with wrap-around handling
    float hueDist = abs(hsl.x - hueCenter);
    hueDist = min(hueDist, 1.0 - hueDist);  // Handle wrap at 0/1
    
    float hueKey = 1.0 - smoothstep(hueRange - feather, hueRange + feather, hueDist);
    
    // Saturation key
    float satKey = smoothstep(satMin - feather, satMin + feather, hsl.y) *
                   (1.0 - smoothstep(satMax - feather, satMax + feather, hsl.y));
    
    // Luminance key
    float lumKey = smoothstep(lumMin - feather, lumMin + feather, hsl.z) *
                   (1.0 - smoothstep(lumMax - feather, lumMax + feather, hsl.z));
    
    // Combine keys multiplicatively
    return hueKey * satKey * lumKey;
}

// Apply correction to HSL values
vec3 applyHslCorrection(vec3 hsl, float hueShift, float satAdjust, float lumAdjust) {
    vec3 corrected = hsl;
    
    // Hue shift with wrap
    corrected.x = fract(corrected.x + hueShift);
    
    // Saturation adjustment
    corrected.y = clamp(corrected.y + satAdjust, 0.0, 1.0);
    
    // Luminance adjustment
    corrected.z = clamp(corrected.z + lumAdjust * 0.5, 0.0, 1.0);
    
    return corrected;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Early exit if disabled
    if (hslEnable == 0) {
        fragColor = color;
        return;
    }
    
    // Decode to linear then HSL
    vec3 rgb = srgbToLinear(color.rgb);
    vec3 hsl = rgbToHsl(rgb);
    
    // Compute selection matte
    float matte = computeHslKey(hsl, hslHueCenter, hslHueRange,
                                hslSatMin, hslSatMax,
                                hslLumMin, hslLumMax, hslFeather);
    
    // Apply correction
    vec3 correctedHsl = applyHslCorrection(hsl, hslHueShift, hslSatAdjust, hslLumAdjust);
    vec3 correctedRgb = hslToRgb(correctedHsl);
    
    // Blend original and corrected by matte
    rgb = mix(rgb, correctedRgb, matte);
    
    // Encode back to sRGB
    rgb = linearToSrgb(max(rgb, vec3(0.0)));
    
    fragColor = vec4(rgb, color.a);
}
