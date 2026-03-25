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
    // data[1].x = offset (mapping), data[1].y = alpha, data[1].z = smoothness, data[1].w = rotation
    // data[2].w = time (global, auto-provided)
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

// --- RGB <-> HSV ---

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

fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
    let cmax = max(c.r, max(c.g, c.b));
    let cmin = min(c.r, min(c.g, c.b));
    let delta = cmax - cmin;

    var h: f32 = 0.0;
    if (delta > 0.0) {
        if (cmax == c.r) {
            h = ((c.g - c.b) / delta % 6.0) / 6.0;
        } else if (cmax == c.g) {
            h = ((c.b - c.r) / delta + 2.0) / 6.0;
        } else {
            h = ((c.r - c.g) / delta + 4.0) / 6.0;
        }
        h = fract(h);
    }
    let s = select(0.0, delta / cmax, cmax > 0.0);
    return vec3<f32>(h, s, cmax);
}

// --- Gamma transfer ---

fn linear2srgb(lin: vec3<f32>) -> vec3<f32> {
    let low = lin * 12.92;
    let high = 1.055 * pow(max(lin, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(high, low, lin < vec3<f32>(0.0031308));
}

fn srgb2linear(c: vec3<f32>) -> vec3<f32> {
    let low = c / 12.92;
    let high = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
    return select(high, low, c < vec3<f32>(0.04045));
}

// --- OkLab core ---

fn oklab2linear(lab: vec3<f32>) -> vec3<f32> {
    let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;

    return vec3<f32>(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    );
}

fn linear2oklab(lin: vec3<f32>) -> vec3<f32> {
    let l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
    let m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
    let s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

    let l_ = pow(max(l, 0.0), 1.0 / 3.0);
    let m_ = pow(max(m, 0.0), 1.0 / 3.0);
    let s_ = pow(max(s, 0.0), 1.0 / 3.0);

    return vec3<f32>(
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    );
}

// --- RGB <-> OkLab ---

fn oklab2rgb(lab: vec3<f32>) -> vec3<f32> {
    return clamp(linear2srgb(oklab2linear(lab)), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn rgb2oklab(rgb: vec3<f32>) -> vec3<f32> {
    return linear2oklab(srgb2linear(rgb));
}

// --- RGB <-> OKLCH (L, C, H where H is 0-1 fractional turns) ---

fn oklch2rgb(lch: vec3<f32>) -> vec3<f32> {
    let a = lch.y * cos(lch.z * TAU);
    let b = lch.y * sin(lch.z * TAU);
    return clamp(linear2srgb(oklab2linear(vec3<f32>(lch.x, a, b))), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn rgb2oklch(rgb: vec3<f32>) -> vec3<f32> {
    let lab = rgb2oklab(rgb);
    let C = length(lab.yz);
    let h = atan2(lab.z, lab.y);
    return vec3<f32>(lab.x, C, fract(h / TAU));
}

// --- Dispatch by mode ---

fn rgbToColorSpace(rgb: vec3<f32>, mode: i32) -> vec3<f32> {
    if (mode == 1) { return rgb2hsv(rgb); }
    if (mode == 2) { return rgb2oklab(rgb); }
    if (mode == 3) { return rgb2oklch(rgb); }
    return rgb;
}

fn colorSpaceToRgb(color: vec3<f32>, mode: i32) -> vec3<f32> {
    if (mode == 1) { return hsv2rgb(color); }
    if (mode == 2) { return oklab2rgb(color); }
    if (mode == 3) { return oklch2rgb(color); }
    return color;
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

// Interpolate in color space with shortest-path hue for HSV/OKLCH
fn mixInColorSpace(a: vec3<f32>, b: vec3<f32>, f: f32, mode: i32) -> vec3<f32> {
    if (mode == 1) {
        // HSV: hue is .x
        var dh = b.x - a.x;
        if (dh > 0.5) { dh -= 1.0; }
        if (dh < -0.5) { dh += 1.0; }
        return vec3<f32>(fract(a.x + dh * f), mix(a.y, b.y, f), mix(a.z, b.z, f));
    } else if (mode == 3) {
        // OKLCH: hue is .z
        var dh = b.z - a.z;
        if (dh > 0.5) { dh -= 1.0; }
        if (dh < -0.5) { dh += 1.0; }
        return vec3<f32>(mix(a.x, b.x, f), mix(a.y, b.y, f), fract(a.z + dh * f));
    }
    return mix(a, b, f);
}

fn sampleColorArray(t_in: f32, colorCount: i32, positionMode: i32, colorMode: i32, smoothAmount: f32) -> vec3<f32> {
    let t = clamp(t_in, 0.0, 1.0);

    // Handle edge cases
    if (colorCount <= 0) {
        return vec3<f32>(0.0);
    }
    if (colorCount == 1) {
        return getColor(0).rgb;
    }

    // Cascade blend: smoothstep at each transition boundary
    var result = rgbToColorSpace(getColor(0).rgb, colorMode);

    for (var i: i32 = 1; i < colorCount; i = i + 1) {
        var boundary: f32;
        var bw: f32;

        if (positionMode == 0) {
            // Auto: equal-width bands, transitions at i/count
            boundary = f32(i) / f32(colorCount);
            bw = smoothAmount * 0.5 / f32(colorCount);
        } else {
            // Manual: transition at midpoint between adjacent positions
            let pPrev = getPosition(i - 1, colorCount, positionMode);
            let pCurr = getPosition(i, colorCount, positionMode);
            boundary = (pPrev + pCurr) * 0.5;
            bw = smoothAmount * (pCurr - pPrev) * 0.25;
        }

        let blend = smoothstep(boundary - bw, boundary + bw, t);
        let nextColor = rgbToColorSpace(getColor(i).rgb, colorMode);
        result = mixInColorSpace(result, nextColor, blend, colorMode);
    }

    // Wrap-around blend: smooth the seam between last and first color
    // when the palette repeats (fract causes a hard edge at t=0/1)
    if (smoothAmount > 0.0) {
        var bw: f32;
        if (positionMode == 0) {
            bw = smoothAmount * 0.5 / f32(colorCount);
        } else {
            let pLast = getPosition(colorCount - 1, colorCount, positionMode);
            let pFirst = getPosition(0, colorCount, positionMode);
            let gap = 1.0 - pLast + pFirst;
            bw = smoothAmount * gap * 0.25;
        }

        if (bw > 0.0) {
            // Signed cyclic distance from the wrap boundary (t=0 ≡ t=1)
            let d = select(t, t - 1.0, t > 0.5);
            // Interpolation factor: 0 = last color, 1 = first color
            let wrapFactor = smoothstep(-bw, bw, d);
            let lastColor = rgbToColorSpace(getColor(colorCount - 1).rgb, colorMode);
            let firstColor = rgbToColorSpace(getColor(0).rgb, colorMode);
            let wrapColor = mixInColorSpace(lastColor, firstColor, wrapFactor, colorMode);

            // Mask: 1.0 at wrap point, fading to 0.0 at edge of zone
            let wrapMask = 1.0 - smoothstep(0.0, bw, abs(d));
            result = mixInColorSpace(result, wrapColor, wrapMask, colorMode);
        }
    }

    return colorSpaceToRgb(result, colorMode);
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
    let rotation = i32(uniforms.data[1].w);
    let time = uniforms.data[2].w;

    // Calculate UV from position
    let size = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = position.xy / size;

    // Get input color
    let inputColor = textureSample(inputTex, samp, uv);

    // Calculate luminance as the t value
    let lum = dot(inputColor.rgb, vec3<f32>(0.299, 0.587, 0.114));

    // Apply mapping: repeat, offset, and rotation (animation)
    var t = lum * (1.0 - 1e-4) * repeatVal + offsetVal;

    if (rotation == -1) {
        t = t + time;
    } else if (rotation == 1) {
        t = t - time;
    }

    t = fract(t);

    // Sample the color array gradient
    let gradientColor = sampleColorArray(t, colorCount, positionMode, colorMode, smoothness);

    // Blend with original based on alpha
    let blendedColor = mix(inputColor.rgb, gradientColor, alpha);

    return vec4<f32>(blendedColor, inputColor.a);
}
