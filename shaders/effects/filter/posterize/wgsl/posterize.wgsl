/*
 * Posterize: sRGB-aware color quantization with adjustable gamma
 */

struct Uniforms {
    levels: f32,
    gamma: f32,
    antialias: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const MIN_LEVELS: f32 = 1.0;
const MIN_GAMMA: f32 = 1e-3;

fn clamp_01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn srgb_to_linear_component(value: f32) -> f32 {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn linear_to_srgb_component(value: f32) -> f32 {
    if (value <= 0.0031308) {
        return value * 12.92;
    }
    return 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

fn srgb_to_linear_rgb(rgb: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        srgb_to_linear_component(rgb.x),
        srgb_to_linear_component(rgb.y),
        srgb_to_linear_component(rgb.z),
    );
}

fn linear_to_srgb_rgb(rgb: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        linear_to_srgb_component(rgb.x),
        linear_to_srgb_component(rgb.y),
        linear_to_srgb_component(rgb.z),
    );
}

fn pow_vec3(value: vec3<f32>, exponent: f32) -> vec3<f32> {
    return vec3<f32>(
        pow(value.x, exponent),
        pow(value.y, exponent),
        pow(value.z, exponent),
    );
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = pos.xy / texSize;
    let texel = textureSample(inputTex, inputSampler, uv);

    let levels_raw = max(uniforms.levels, 0.0);
    let levels_quantized = max(round(levels_raw), MIN_LEVELS);
    if (levels_quantized <= 1.0) {
        return texel;
    }

    let level_factor = levels_quantized;
    let inv_factor = 1.0 / level_factor;
    let half_step = inv_factor * 0.5;
    let gamma_value = max(uniforms.gamma, MIN_GAMMA);
    let inv_gamma = 1.0 / gamma_value;

    var working_rgb = srgb_to_linear_rgb(texel.xyz);
    working_rgb = pow_vec3(clamp(working_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), gamma_value);

    // Posterize with optional edge smoothing
    let scaled = working_rgb * level_factor + vec3<f32>(half_step);
    var quantized_rgb: vec3<f32>;
    if (uniforms.antialias != 0) {
        let f = fract(scaled);
        let fw = fwidth(scaled);
        let blend = smoothstep(0.5 - fw * 0.5, 0.5 + fw * 0.5, f);
        quantized_rgb = (floor(scaled) + blend) * inv_factor;
    } else {
        quantized_rgb = floor(scaled) * inv_factor;
    }
    quantized_rgb = pow_vec3(clamp(quantized_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), inv_gamma);

    quantized_rgb = linear_to_srgb_rgb(quantized_rgb);

    return vec4<f32>(
        clamp_01(quantized_rgb.x),
        clamp_01(quantized_rgb.y),
        clamp_01(quantized_rgb.z),
        texel.w,
    );
}
