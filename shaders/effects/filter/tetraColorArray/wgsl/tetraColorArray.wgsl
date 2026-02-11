/**
 * Tetra Color Array Gradient - WGSL Fragment Shader
 *
 * Applies a discrete color array gradient to the input image based on luminance.
 * Supports up to 8 colors with manual or auto-positioned stops.
 * Supports RGB, HSV, OkLab, and OKLCH color modes.
 */

struct Uniforms {
    data: array<vec4<f32>, 12>,
    // data[0].x = colorMode, data[0].y = colorCount, data[0].z = positionMode, data[0].w = repeat
    // data[1].x = offset (mapping), data[1].y = alpha, data[1].z = smoothness, data[1].w = reserved
    // data[2].xyz = color0 (rgb)
    // data[3].xyz = color1 (rgb)
    // data[4].xyz = color2 (rgb)
    // data[5].xyz = color3 (rgb)
    // data[6].xyz = color4 (rgb)
    // data[7].xyz = color5 (rgb)
    // data[8].xyz = color6 (rgb)
    // data[9].xyz = color7 (rgb)
    // data[10].xyzw = positions 0-3
    // data[11].xyzw = positions 4-7
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.283185307179586;

// ============================================================================
// Color Space Conversions
// ============================================================================

// HSV to RGB
fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = hsv.x;
    let s = hsv.y;
    let v = hsv.z;

    let c = v * s;
    let hp = h * 6.0;
    let x = c * (1.0 - abs(hp % 2.0 - 1.0));
    let m = v - c;

    var rgb: vec3<f32>;
    if (hp < 1.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (hp < 2.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (hp < 3.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (hp < 4.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (hp < 5.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb + vec3<f32>(m);
}

// OkLab to linear RGB
fn oklab2linear(lab: vec3<f32>) -> vec3<f32> {
    let L = lab.x;
    let a = lab.y;
    let b = lab.z;

    let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    return vec3<f32>(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

// Linear to sRGB gamma
fn linear2srgb(linear: vec3<f32>) -> vec3<f32> {
    let low = linear * 12.92;
    let high = 1.055 * pow(max(linear, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(high, low, linear < vec3<f32>(0.0031308));
}

// OkLab to sRGB
fn oklab2rgb(lab: vec3<f32>) -> vec3<f32> {
    // Remap a, b from 0-1 storage format to actual -0.4 to 0.4 range
    let L = lab.x;
    let a = (lab.y - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4
    let b = (lab.z - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4

    let linear_rgb = oklab2linear(vec3<f32>(L, a, b));
    return clamp(linear2srgb(linear_rgb), vec3<f32>(0.0), vec3<f32>(1.0));
}

// OKLCH to sRGB
fn oklch2rgb(lch: vec3<f32>) -> vec3<f32> {
    let L = lch.x;
    let C = lch.y * 0.4;  // 0-1 → 0 to 0.4
    let H = lch.z * TAU;  // 0-1 → 0 to 2π

    // Convert cylindrical to cartesian (OkLab)
    let a = C * cos(H);
    let b = C * sin(H);

    let linear_rgb = oklab2linear(vec3<f32>(L, a, b));
    return clamp(linear2srgb(linear_rgb), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Convert color based on mode
fn convertColor(color: vec3<f32>, colorMode: i32) -> vec3<f32> {
    if (colorMode == 1) {
        return hsv2rgb(color);
    } else if (colorMode == 2) {
        return oklab2rgb(color);
    } else if (colorMode == 3) {
        return oklch2rgb(color);
    } else {
        return color;  // RGB mode
    }
}

// ============================================================================
// Color Array Helpers
// ============================================================================

fn getColor(index: i32) -> vec4<f32> {
    switch (index) {
        case 0: { return uniforms.data[2]; }
        case 1: { return uniforms.data[3]; }
        case 2: { return uniforms.data[4]; }
        case 3: { return uniforms.data[5]; }
        case 4: { return uniforms.data[6]; }
        case 5: { return uniforms.data[7]; }
        case 6: { return uniforms.data[8]; }
        case 7: { return uniforms.data[9]; }
        default: { return uniforms.data[2]; }
    }
}

fn getPosition(index: i32, colorCount: i32, positionMode: i32) -> f32 {
    // Auto mode: evenly distribute
    if (positionMode == 0) {
        if (colorCount <= 1) {
            return 0.0;
        }
        return f32(index) / f32(colorCount - 1);
    }

    // Manual mode: use stored positions
    switch (index) {
        case 0: { return uniforms.data[10].x; }
        case 1: { return uniforms.data[10].y; }
        case 2: { return uniforms.data[10].z; }
        case 3: { return uniforms.data[10].w; }
        case 4: { return uniforms.data[11].x; }
        case 5: { return uniforms.data[11].y; }
        case 6: { return uniforms.data[11].z; }
        case 7: { return uniforms.data[11].w; }
        default: { return 0.0; }
    }
}

fn sampleColorArray(t: f32, colorCount: i32, positionMode: i32, colorMode: i32, smoothAmount: f32) -> vec3<f32> {
    // Handle edge cases
    if (colorCount <= 0) {
        return vec3<f32>(0.0);
    }
    if (colorCount == 1) {
        return convertColor(getColor(0).rgb, colorMode);
    }

    // Find the two colors to interpolate between
    var lowerIdx: i32 = 0;
    var upperIdx: i32 = colorCount - 1;

    for (var i: i32 = 0; i < colorCount - 1; i = i + 1) {
        let pos = getPosition(i, colorCount, positionMode);
        let nextPos = getPosition(i + 1, colorCount, positionMode);
        if (t >= pos && t <= nextPos) {
            lowerIdx = i;
            upperIdx = i + 1;
            break;
        }
    }

    // Handle edge cases where t is outside all color stops
    let firstPos = getPosition(0, colorCount, positionMode);
    let lastPos = getPosition(colorCount - 1, colorCount, positionMode);

    if (t <= firstPos) {
        return convertColor(getColor(0).rgb, colorMode);
    }
    if (t >= lastPos) {
        return convertColor(getColor(colorCount - 1).rgb, colorMode);
    }

    // Interpolate between the two colors
    let lowerPos = getPosition(lowerIdx, colorCount, positionMode);
    let upperPos = getPosition(upperIdx, colorCount, positionMode);

    let range = upperPos - lowerPos;
    let localT = select((t - lowerPos) / range, 0.0, range <= 0.0);

    // Apply smoothness to interpolation factor
    // smoothAmount=0: hard bands (step at midpoint)
    // smoothAmount=1: linear interpolation (current behavior)
    let factor = mix(step(0.5, localT), localT, smoothAmount);

    let lowerColor = convertColor(getColor(lowerIdx).rgb, colorMode);
    let upperColor = convertColor(getColor(upperIdx).rgb, colorMode);

    return mix(lowerColor, upperColor, factor);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // Extract uniforms
    let colorMode = i32(uniforms.data[0].x);
    let colorCount = i32(uniforms.data[0].y);
    let positionMode = i32(uniforms.data[0].z);
    let repeatVal = uniforms.data[0].w;
    let offsetVal = uniforms.data[1].x;
    let alpha = uniforms.data[1].y;
    let smoothness = uniforms.data[1].z;

    // Calculate UV from position
    let size = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / size;

    // Get input color
    let inputColor = textureSample(inputTex, samp, uv);

    // Calculate luminance as the t value
    let lum = dot(inputColor.rgb, vec3<f32>(0.299, 0.587, 0.114));

    // Apply mapping: repeat and offset
    let t = fract(lum * repeatVal + offsetVal);

    // Sample the color array gradient
    let gradientColor = sampleColorArray(t, colorCount, positionMode, colorMode, smoothness);

    // Blend with original based on alpha
    let blendedColor = mix(inputColor.rgb, gradientColor, alpha);

    return vec4<f32>(blendedColor, inputColor.a);
}
