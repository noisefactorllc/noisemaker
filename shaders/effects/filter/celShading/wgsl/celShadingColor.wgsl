/*
 * Cel Shading - Color Pass
 * sRGB-aware color quantization with diffuse shading
 */

struct Uniforms {
    lightDirection: vec3f,
    levels: i32,
    strength: f32,
    gamma: f32,
    antialias: i32,
    _pad: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const MIN_GAMMA: f32 = 1e-3;

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
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    let origColor = textureSample(inputTex, inputSampler, uv);
    let lev = f32(uniforms.levels);

    // Apply diffuse shading based on light direction
    let lightDir = normalize(uniforms.lightDirection);
    let gradientShade = dot(normalize(vec3f(uv - 0.5, 0.5)), lightDir);
    let diffuse = 0.5 + 0.5 * gradientShade;
    let shadeFactor = mix(1.0, 0.5 + 0.5 * diffuse, uniforms.strength);
    let shadedColor = origColor.rgb * shadeFactor;

    // sRGB-aware quantization
    let gamma_value = max(uniforms.gamma, MIN_GAMMA);
    let inv_gamma = 1.0 / gamma_value;
    let inv_factor = 1.0 / lev;
    let half_step = inv_factor * 0.5;

    var working_rgb = srgb_to_linear_rgb(shadedColor);
    working_rgb = pow_vec3(clamp(working_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), gamma_value);

    // Posterize with optional edge smoothing
    let scaled = working_rgb * lev + vec3<f32>(half_step);
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

    return vec4f(clamp(quantized_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), origColor.a);
}
