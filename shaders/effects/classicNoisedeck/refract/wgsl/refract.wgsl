/*
 * Refract shader (WGSL fragment version).
 * Applies noise-based UV perturbations to refract the input feed.
 * Scale and strength controls are normalized relative to resolution to prevent tearing.
 */

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> mode : i32;
@group(0) @binding(3) var<uniform> amount : f32;
@group(0) @binding(4) var<uniform> direction : f32;
@group(0) @binding(5) var<uniform> blendMode : i32;
@group(0) @binding(6) var<uniform> mixAmt : f32;
@group(0) @binding(7) var<uniform> wrap : i32;

fn map_range(value : f32, inMin : f32, inMax : f32, outMin : f32, outMax : f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn desaturate(color : vec3<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn convolve_kernel(uv : vec2<f32>, kernel : array<f32, 9>, divide : bool) -> vec3<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let steps = 1.0 / dims;
    var offsets : array<vec2<f32>, 9>;
    offsets[0] = vec2<f32>(-steps.x, -steps.y);
    offsets[1] = vec2<f32>(0.0, -steps.y);
    offsets[2] = vec2<f32>(steps.x, -steps.y);
    offsets[3] = vec2<f32>(-steps.x, 0.0);
    offsets[4] = vec2<f32>(0.0, 0.0);
    offsets[5] = vec2<f32>(steps.x, 0.0);
    offsets[6] = vec2<f32>(-steps.x, steps.y);
    offsets[7] = vec2<f32>(0.0, steps.y);
    offsets[8] = vec2<f32>(steps.x, steps.y);

    var kernelWeight : f32 = 0.0;
    var conv : vec3<f32> = vec3<f32>(0.0);
    let scale = floor(map_range(amount, 0.0, 100.0, 0.0, 20.0));

    for (var i : i32 = 0; i < 9; i = i + 1) {
        let color = textureSample(inputTex, samp, uv + offsets[i] * scale).rgb;
        conv = conv + color * kernel[i];
        kernelWeight = kernelWeight + kernel[i];
    }

    if (divide && kernelWeight != 0.0) {
        conv = conv / kernelWeight;
    }

    return clamp(conv, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn derivX(uv : vec2<f32>, divide : bool) -> vec3<f32> {
    var kernel : array<f32, 9>;
    kernel[0] = 0.0; kernel[1] = 0.0; kernel[2] = 0.0;
    kernel[3] = 0.0; kernel[4] = 1.0; kernel[5] = -1.0;
    kernel[6] = 0.0; kernel[7] = 0.0; kernel[8] = 0.0;
    return convolve_kernel(uv, kernel, divide);
}

fn derivY(uv : vec2<f32>, divide : bool) -> vec3<f32> {
    var kernel : array<f32, 9>;
    kernel[0] = 0.0; kernel[1] = 0.0; kernel[2] = 0.0;
    kernel[3] = 0.0; kernel[4] = 1.0; kernel[5] = 0.0;
    kernel[6] = 0.0; kernel[7] = -1.0; kernel[8] = 0.0;
    return convolve_kernel(uv, kernel, divide);
}

fn blendOverlay(a : f32, b : f32) -> f32 {
    if (a < 0.5) {
        return 2.0 * a * b;
    }
    return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
}

fn blendSoftLight(base : f32, blend : f32) -> f32 {
    if (blend < 0.5) {
        return 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
    }
    return sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
}

fn vec4_eq(a : vec4<f32>, b : vec4<f32>) -> bool {
    return all(a == b);
}

fn blend_colors(color1 : vec4<f32>, color2 : vec4<f32>) -> vec3<f32> {
    var color : vec4<f32>;
    var middle : vec4<f32>;
    var amt = map_range(mixAmt, 0.0, 100.0, 0.0, 1.0);

    if (blendMode == 0) {
        // add
        middle = min(color1 + color2, vec4<f32>(1.0));
    } else if (blendMode == 2) {
        // color burn
        if (vec4_eq(color2, vec4<f32>(0.0))) {
            middle = color2;
        } else {
            middle = max((1.0 - ((1.0 - color1) / color2)), vec4<f32>(0.0));
        }
    } else if (blendMode == 3) {
        // color dodge
        if (vec4_eq(color2, vec4<f32>(1.0))) {
            middle = color2;
        } else {
            middle = min(color1 / (1.0 - color2), vec4<f32>(1.0));
        }
    } else if (blendMode == 4) {
        // darken
        middle = min(color1, color2);
    } else if (blendMode == 5) {
        // difference
        middle = abs(color1 - color2);
    } else if (blendMode == 6) {
        // exclusion
        middle = color1 + color2 - 2.0 * color1 * color2;
    } else if (blendMode == 7) {
        // glow
        if (vec4_eq(color2, vec4<f32>(1.0))) {
            middle = color2;
        } else {
            middle = min(color1 * color1 / (1.0 - color2), vec4<f32>(1.0));
        }
    } else if (blendMode == 8) {
        // hard light
        middle = vec4<f32>(
            blendOverlay(color2.r, color1.r),
            blendOverlay(color2.g, color1.g),
            blendOverlay(color2.b, color1.b),
            mix(color1.a, color2.a, 0.5)
        );
    } else if (blendMode == 9) {
        // lighten
        middle = max(color1, color2);
    } else if (blendMode == 10) {
        // mix
        middle = mix(color1, color2, 0.5);
    } else if (blendMode == 11) {
        // multiply
        middle = color1 * color2;
    } else if (blendMode == 12) {
        // negation
        middle = vec4<f32>(1.0) - abs(vec4<f32>(1.0) - color1 - color2);
    } else if (blendMode == 13) {
        // overlay
        middle = vec4<f32>(
            blendOverlay(color1.r, color2.r),
            blendOverlay(color1.g, color2.g),
            blendOverlay(color1.b, color2.b),
            mix(color1.a, color2.a, 0.5)
        );
    } else if (blendMode == 14) {
        // phoenix
        middle = min(color1, color2) - max(color1, color2) + vec4<f32>(1.0);
    } else if (blendMode == 15) {
        // reflect
        if (vec4_eq(color1, vec4<f32>(1.0))) {
            middle = color1;
        } else {
            middle = min(color2 * color2 / (1.0 - color1), vec4<f32>(1.0));
        }
    } else if (blendMode == 16) {
        // screen
        middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
    } else if (blendMode == 17) {
        // soft light
        middle = vec4<f32>(
            blendSoftLight(color1.r, color2.r),
            blendSoftLight(color1.g, color2.g),
            blendSoftLight(color1.b, color2.b),
            mix(color1.a, color2.a, 0.5)
        );
    } else {
        // subtract (blendMode == 18)
        middle = max(color1 + color2 - 1.0, vec4<f32>(0.0));
    }

    if (amt == 0.5) {
        color = middle;
    } else if (amt < 0.5) {
        amt = map_range(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, amt);
    } else {
        amt = map_range(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, amt);
    }

    return color.rgb;
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    var uv = position.xy / dims;

    var color = vec4<f32>(0.0);
    let inputColor = textureSample(inputTex, samp, uv);
    let brightness = desaturate(inputColor.rgb) + direction / 360.0;

    if (mode == 0) {
        uv.x = uv.x + cos(brightness * TAU) * amount * 0.01;
        uv.y = uv.y + sin(brightness * TAU) * amount * 0.01;
    } else if (mode == 1) {
        uv.y = uv.y + desaturate(derivX(uv, false)) * amount * 0.01;
        uv.x = uv.x + desaturate(derivY(uv, false)) * amount * 0.01;
    }

    if (wrap == 0) {
        // mirror (default) - no change
    } else if (wrap == 1) {
        // repeat
        uv = fract(uv);
    } else if (wrap == 2) {
        // clamp
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    color = textureSample(inputTex, samp, uv);
    color = vec4<f32>(blend_colors(inputColor, color), color.a);

    return color;
}
