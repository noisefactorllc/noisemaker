/*
 * Cosine palette colorization effect
 * Supports RGB, HSV, and OkLab colorspaces
 */

struct Uniforms {
    data: array<vec4<f32>, 2>,
    // data[0].x = paletteIndex
    // data[0].y = paletteRotation (-1, 0, 1)
    // data[0].z = paletteOffset (0-100)
    // data[0].w = paletteRepeat
    // data[1].x = alpha
    // data[1].y = time
};

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

struct PaletteEntry {
    amp: vec4f,    // .xyz = amplitude, .w = mode (0=rgb, 1=hsv, 2=oklab)
    freq: vec4f,
    offset: vec4f,
    phase: vec4f,
};

// Palette data array (55 entries, index 0 is passthrough so entries start at 1)
// Modes: 0 = RGB, 1 = HSV, 2 = OkLab
const palettes: array<PaletteEntry, 55> = array<PaletteEntry, 55>(
    // 1: seventiesShirt (rgb)
    PaletteEntry(vec4f(0.76, 0.88, 0.37, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.93, 0.97, 0.52, 0.0), vec4f(0.21, 0.41, 0.56, 0.0)),
    // 2: fiveG (rgb)
    PaletteEntry(vec4f(0.56851584, 0.7740668, 0.23485267, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.727029, 0.08039695, 0.10427457, 0.0)),
    // 3: afterimage (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.3, 0.2, 0.2, 0.0)),
    // 4: barstow (rgb)
    PaletteEntry(vec4f(0.45, 0.2, 0.1, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.7, 0.2, 0.2, 0.0), vec4f(0.5, 0.4, 0.0, 0.0)),
    // 5: bloob (rgb)
    PaletteEntry(vec4f(0.09, 0.59, 0.48, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.2, 0.31, 0.98, 0.0), vec4f(0.88, 0.4, 0.33, 0.0)),
    // 6: blueSkies (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.1, 0.4, 0.7, 0.0), vec4f(0.1, 0.1, 0.1, 0.0)),
    // 7: brushedMetal (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.0, 0.1, 0.2, 0.0)),
    // 8: burningSky (rgb)
    PaletteEntry(vec4f(0.7259015, 0.7004237, 0.9494409, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.63290054, 0.37883538, 0.29405284, 0.0), vec4f(0.0, 0.1, 0.2, 0.0)),
    // 9: california (rgb)
    PaletteEntry(vec4f(0.94, 0.33, 0.27, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.74, 0.37, 0.73, 0.0), vec4f(0.44, 0.17, 0.88, 0.0)),
    // 10: columbia (rgb)
    PaletteEntry(vec4f(1.0, 0.7, 1.0, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(1.0, 0.4, 0.9, 0.0), vec4f(0.4, 0.5, 0.6, 0.0)),
    // 11: cottonCandy (rgb)
    PaletteEntry(vec4f(0.51, 0.39, 0.41, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.59, 0.53, 0.94, 0.0), vec4f(0.15, 0.41, 0.46, 0.0)),
    // 12: darkSatin (hsv)
    PaletteEntry(vec4f(0.0, 0.0, 0.51, 1.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.43, 0.0), vec4f(0.0, 0.0, 0.36, 0.0)),
    // 13: dealerHat (rgb)
    PaletteEntry(vec4f(0.83, 0.45, 0.19, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.79, 0.45, 0.35, 0.0), vec4f(0.28, 0.91, 0.61, 0.0)),
    // 14: dreamy (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.0, 0.2, 0.25, 0.0)),
    // 15: eventHorizon (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.22, 0.48, 0.62, 0.0), vec4f(0.1, 0.3, 0.2, 0.0)),
    // 16: ghostly (hsv)
    PaletteEntry(vec4f(0.02, 0.92, 0.76, 1.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.51, 0.49, 0.51, 0.0), vec4f(0.71, 0.23, 0.66, 0.0)),
    // 17: grayscale (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(2.0, 2.0, 2.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0)),
    // 18: hazySunset (rgb)
    PaletteEntry(vec4f(0.79, 0.56, 0.22, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.96, 0.5, 0.49, 0.0), vec4f(0.15, 0.98, 0.87, 0.0)),
    // 19: heatmap (rgb)
    PaletteEntry(vec4f(0.75804377, 0.62868536, 0.2227562, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.35536355, 0.12935615, 0.17060602, 0.0), vec4f(0.0, 0.25, 0.5, 0.0)),
    // 20: hypercolor (rgb)
    PaletteEntry(vec4f(0.79, 0.5, 0.23, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.75, 0.47, 0.45, 0.0), vec4f(0.08, 0.84, 0.16, 0.0)),
    // 21: jester (rgb)
    PaletteEntry(vec4f(0.7, 0.81, 0.73, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.1, 0.22, 0.27, 0.0), vec4f(0.99, 0.12, 0.94, 0.0)),
    // 22: justBlue (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0)),
    // 23: justCyan (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.0, 1.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0)),
    // 24: justGreen (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0)),
    // 25: justPurple (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 0.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0)),
    // 26: justRed (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0)),
    // 27: justYellow (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 0.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0)),
    // 28: mars (rgb)
    PaletteEntry(vec4f(0.74, 0.33, 0.09, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.62, 0.2, 0.2, 0.0), vec4f(0.2, 0.1, 0.0, 0.0)),
    // 29: modesto (rgb)
    PaletteEntry(vec4f(0.56, 0.68, 0.39, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.72, 0.07, 0.62, 0.0), vec4f(0.25, 0.4, 0.41, 0.0)),
    // 30: moss (rgb)
    PaletteEntry(vec4f(0.78, 0.39, 0.07, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.0, 0.53, 0.33, 0.0), vec4f(0.94, 0.92, 0.9, 0.0)),
    // 31: neptune (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.2, 0.64, 0.62, 0.0), vec4f(0.15, 0.2, 0.3, 0.0)),
    // 32: netOfGems (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.64, 0.12, 0.84, 0.0), vec4f(0.1, 0.25, 0.15, 0.0)),
    // 33: organic (rgb)
    PaletteEntry(vec4f(0.42, 0.42, 0.04, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.47, 0.27, 0.27, 0.0), vec4f(0.41, 0.14, 0.11, 0.0)),
    // 34: papaya (rgb)
    PaletteEntry(vec4f(0.65, 0.4, 0.11, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.72, 0.45, 0.08, 0.0), vec4f(0.71, 0.8, 0.84, 0.0)),
    // 35: radioactive (rgb)
    PaletteEntry(vec4f(0.62, 0.79, 0.11, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.22, 0.56, 0.17, 0.0), vec4f(0.15, 0.1, 0.25, 0.0)),
    // 36: royal (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.41, 0.22, 0.67, 0.0), vec4f(0.2, 0.25, 0.2, 0.0)),
    // 37: santaCruz (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.25, 0.5, 0.75, 0.0)),
    // 38: sherbet (rgb)
    PaletteEntry(vec4f(0.6059281, 0.17591387, 0.17166573, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.5224456, 0.3864609, 0.36020845, 0.0), vec4f(0.0, 0.25, 0.5, 0.0)),
    // 39: sherbetDouble (rgb)
    PaletteEntry(vec4f(0.6059281, 0.17591387, 0.17166573, 0.0), vec4f(2.0, 2.0, 2.0, 0.0), vec4f(0.5224456, 0.3864609, 0.36020845, 0.0), vec4f(0.0, 0.25, 0.5, 0.0)),
    // 40: silvermane (oklab)
    PaletteEntry(vec4f(0.42, 0.0, 0.0, 2.0), vec4f(2.0, 2.0, 2.0, 0.0), vec4f(0.45, 0.5, 0.42, 0.0), vec4f(0.63, 1.0, 1.0, 0.0)),
    // 41: skykissed (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.83, 0.6, 0.63, 0.0), vec4f(0.3, 0.1, 0.0, 0.0)),
    // 42: solaris (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.6, 0.4, 0.1, 0.0), vec4f(0.3, 0.2, 0.1, 0.0)),
    // 43: spooky (oklab)
    PaletteEntry(vec4f(0.46, 0.73, 0.19, 2.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.27, 0.79, 0.78, 0.0), vec4f(0.27, 0.16, 0.04, 0.0)),
    // 44: springtime (rgb)
    PaletteEntry(vec4f(0.67, 0.25, 0.27, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.74, 0.48, 0.46, 0.0), vec4f(0.07, 0.79, 0.39, 0.0)),
    // 45: sproingtime (rgb)
    PaletteEntry(vec4f(0.9, 0.43, 0.34, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.56, 0.69, 0.32, 0.0), vec4f(0.03, 0.8, 0.4, 0.0)),
    // 46: sulphur (rgb)
    PaletteEntry(vec4f(0.73, 0.36, 0.52, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.78, 0.68, 0.15, 0.0), vec4f(0.74, 0.93, 0.28, 0.0)),
    // 47: summoning (rgb)
    PaletteEntry(vec4f(1.0, 0.0, 0.8, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 0.0), vec4f(0.0, 0.5, 0.1, 0.0)),
    // 48: superhero (rgb)
    PaletteEntry(vec4f(1.0, 0.25, 0.5, 0.0), vec4f(0.5, 0.5, 0.5, 0.0), vec4f(0.0, 0.0, 0.25, 0.0), vec4f(0.5, 0.0, 0.0, 0.0)),
    // 49: toxic (rgb)
    PaletteEntry(vec4f(0.5, 0.5, 0.5, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.26, 0.57, 0.03, 0.0), vec4f(0.0, 0.1, 0.3, 0.0)),
    // 50: tropicalia (oklab)
    PaletteEntry(vec4f(0.28, 0.08, 0.65, 2.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.48, 0.6, 0.03, 0.0), vec4f(0.1, 0.15, 0.3, 0.0)),
    // 51: tungsten (rgb)
    PaletteEntry(vec4f(0.65, 0.93, 0.73, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.31, 0.21, 0.27, 0.0), vec4f(0.43, 0.45, 0.48, 0.0)),
    // 52: vaporwave (rgb)
    PaletteEntry(vec4f(0.9, 0.76, 0.63, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.0, 0.19, 0.68, 0.0), vec4f(0.43, 0.23, 0.32, 0.0)),
    // 53: vibrant (rgb)
    PaletteEntry(vec4f(0.78, 0.63, 0.68, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.41, 0.03, 0.16, 0.0), vec4f(0.81, 0.61, 0.06, 0.0)),
    // 54: vintage (rgb)
    PaletteEntry(vec4f(0.97, 0.74, 0.23, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.97, 0.38, 0.35, 0.0), vec4f(0.34, 0.41, 0.44, 0.0)),
    // 55: vintagePhoto (rgb)
    PaletteEntry(vec4f(0.68, 0.79, 0.57, 0.0), vec4f(1.0, 1.0, 1.0, 0.0), vec4f(0.56, 0.35, 0.14, 0.0), vec4f(0.73, 0.9, 0.99, 0.0))
);

// HSV to RGB conversion
fn hsv_to_rgb(hsv: vec3f) -> vec3f {
    let h = hsv.x;
    let s = hsv.y;
    let v = hsv.z;

    let c = v * s;
    let hp = h * 6.0;
    let x = c * (1.0 - abs(hp % 2.0 - 1.0));
    let m = v - c;

    var rgb: vec3f;
    if (hp < 1.0) {
        rgb = vec3f(c, x, 0.0);
    } else if (hp < 2.0) {
        rgb = vec3f(x, c, 0.0);
    } else if (hp < 3.0) {
        rgb = vec3f(0.0, c, x);
    } else if (hp < 4.0) {
        rgb = vec3f(0.0, x, c);
    } else if (hp < 5.0) {
        rgb = vec3f(x, 0.0, c);
    } else {
        rgb = vec3f(c, 0.0, x);
    }

    return rgb + vec3f(m, m, m);
}

// OkLab to linear RGB conversion
fn oklab_to_linear_rgb(lab: vec3f) -> vec3f {
    let L = lab.x;
    let a = lab.y;
    let b = lab.z;

    let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    return vec3f(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

// Linear to sRGB conversion (gamma correction)
fn linear_to_srgb(linear: vec3f) -> vec3f {
    let low = linear * 12.92;
    let high = 1.055 * pow(linear, vec3f(1.0 / 2.4)) - 0.055;
    return select(high, low, linear <= vec3f(0.0031308));
}

// Combined OkLab to sRGB
fn oklab_to_rgb(lab: vec3f) -> vec3f {
    let linear_rgb = oklab_to_linear_rgb(lab);
    return clamp(linear_to_srgb(linear_rgb), vec3f(0.0), vec3f(1.0));
}

// Cosine palette function - IQ formula
fn cosine_palette(t: f32, amp: vec3f, freq: vec3f, offset: vec3f, phase: vec3f) -> vec3f {
    let TAU = 6.283185307179586;
    return clamp(offset + amp * cos(TAU * (freq * t + phase)), vec3f(0.0), vec3f(1.0));
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Calculate UV from position
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    // Get input color
    let inputColor = textureSample(inputTex, inputSampler, uv);

    // Get uniforms
    let paletteIndex = i32(uniforms.data[0].x);
    let paletteRotation = i32(uniforms.data[0].y);
    let paletteOffset = uniforms.data[0].z;
    let paletteRepeat = uniforms.data[0].w;
    let time = uniforms.data[1].y;

    // Index 0 is passthrough
    if (paletteIndex <= 0 || paletteIndex > 55) {
        return inputColor;
    }

    // Calculate luminance as the t value
    let lum = dot(inputColor.rgb, vec3f(0.299, 0.587, 0.114));

    // Apply palette modifiers: repeat, offset, and rotation (animation)
    var t = lum * paletteRepeat + paletteOffset * 0.01;
    if (paletteRotation == -1) {
        t = t + time;
    } else if (paletteRotation == 1) {
        t = t - time;
    }

    // Get palette entry (array is 0-indexed, palette indices are 1-indexed)
    let entry = palettes[paletteIndex - 1];

    // Extract mode from amp.w
    let mode = i32(entry.amp.w + 0.5);

    // Apply cosine palette in the appropriate colorspace
    let paletteColor = cosine_palette(t, entry.amp.xyz, entry.freq.xyz, entry.offset.xyz, entry.phase.xyz);

    // Convert to RGB based on mode
    var finalColor: vec3f;
    if (mode == 1) {
        // HSV mode - palette output is HSV, convert to RGB
        finalColor = hsv_to_rgb(paletteColor);
    } else if (mode == 2) {
        // OkLab mode - palette output is OkLab (L, a, b), convert to RGB
        finalColor = oklab_to_rgb(paletteColor);
    } else {
        // RGB mode (default) - no conversion needed
        finalColor = paletteColor;
    }

    // Blend between original and palette color based on alpha
    let alpha = uniforms.data[1].x;
    let blendedColor = mix(inputColor.rgb, finalColor, alpha);

    return vec4f(blendedColor, inputColor.a);
}
