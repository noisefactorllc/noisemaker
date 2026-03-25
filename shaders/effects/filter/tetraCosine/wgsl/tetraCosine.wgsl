/**
 * Tetra Cosine Gradient - WGSL Fragment Shader
 *
 * Applies a cosine palette to the input image based on luminance.
 * Uses the Inigo Quilez cosine palette formula:
 *   color(t) = offset + amp * cos(2π * (freq * t + phase))
 *
 * Supports RGB, HSV, OkLab, and OKLCH color modes.
 */

struct Uniforms {
    data: array<vec4<f32>, 5>,
    // data[0].x = offsetR, data[0].y = offsetG, data[0].z = offsetB, data[0].w = colorMode
    // data[1].x = ampR, data[1].y = ampG, data[1].z = ampB, data[1].w = repeat
    // data[2].x = freqR, data[2].y = freqG, data[2].z = freqB, data[2].w = offset (mapping)
    // data[3].x = phaseR, data[3].y = phaseG, data[3].z = phaseB, data[3].w = alpha
    // data[4].x = rotation, data[4].y = time
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

// OkLab to sRGB (cosine output is 0-1, a/b need remapping from 0-1 to -0.4..0.4)
fn oklab2rgb(lab: vec3<f32>) -> vec3<f32> {
    // Remap a, b from 0-1 storage format to actual -0.4 to 0.4 range
    let L = lab.x;
    let a = (lab.y - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4
    let b = (lab.z - 0.5) * 0.8;  // 0-1 → -0.4 to 0.4

    let linear_rgb = oklab2linear(vec3<f32>(L, a, b));
    return clamp(linear2srgb(linear_rgb), vec3<f32>(0.0), vec3<f32>(1.0));
}

// OKLCH to sRGB (cosine output is L 0-1, C 0-1 representing 0-0.4, H 0-1)
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

// ============================================================================
// Cosine Palette
// ============================================================================

fn cosinePalette(t: f32, offset: vec3<f32>, amp: vec3<f32>, freq: vec3<f32>, phase: vec3<f32>) -> vec3<f32> {
    return clamp(offset + amp * cos(TAU * (freq * t + phase)), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    // Extract uniforms
    let offset = uniforms.data[0].xyz;
    let colorMode = i32(uniforms.data[0].w);
    let amp = uniforms.data[1].xyz;
    let repeatVal = uniforms.data[1].w;
    let freq = uniforms.data[2].xyz;
    let offsetVal = uniforms.data[2].w;
    let phase = uniforms.data[3].xyz;
    let alpha = uniforms.data[3].w;
    let rotation = i32(uniforms.data[4].x);
    let time = uniforms.data[4].y;

    // Calculate UV from position
    let size = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / size;

    // Get input color
    let inputColor = textureSample(inputTex, samp, uv);

    // Calculate luminance as the t value
    let lum = dot(inputColor.rgb, vec3<f32>(0.299, 0.587, 0.114));

    // Apply mapping: repeat, offset, and rotation (animation)
    var t = lum * repeatVal + offsetVal;

    if (rotation == -1) {
        t = t + time;
    } else if (rotation == 1) {
        t = t - time;
    }

    t = fract(t);

    // Evaluate cosine palette
    let paletteColor = cosinePalette(t, offset, amp, freq, phase);

    // Convert from color mode to RGB
    var finalColor: vec3<f32>;
    if (colorMode == 1) {
        // HSV mode
        finalColor = hsv2rgb(paletteColor);
    } else if (colorMode == 2) {
        // OkLab mode
        finalColor = oklab2rgb(paletteColor);
    } else if (colorMode == 3) {
        // OKLCH mode
        finalColor = oklch2rgb(paletteColor);
    } else {
        // RGB mode (default)
        finalColor = paletteColor;
    }

    // Blend with original based on alpha
    let blendedColor = mix(inputColor.rgb, finalColor, alpha);

    return vec4<f32>(blendedColor, inputColor.a);
}
