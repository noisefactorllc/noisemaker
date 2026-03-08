// Posterize effect: reduces tonal resolution with sRGB-aware quantization
// and adjustable gamma curve.

const CHANNEL_COUNT : u32 = 4u;
const MIN_LEVELS : f32 = 1.0;
const MIN_GAMMA : f32 = 1e-3;

struct PosterizeParams {
    levels : f32,
    gamma : f32,
}

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output_buffer : array<f32>;
@group(0) @binding(2) var<uniform> params : PosterizeParams;

fn clamp_01(value : f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn srgb_to_linear_component(value : f32) -> f32 {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn linear_to_srgb_component(value : f32) -> f32 {
    if (value <= 0.0031308) {
        return value * 12.92;
    }
    return 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

fn srgb_to_linear_rgb(rgb : vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        srgb_to_linear_component(rgb.x),
        srgb_to_linear_component(rgb.y),
        srgb_to_linear_component(rgb.z)
    );
}

fn linear_to_srgb_rgb(rgb : vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        linear_to_srgb_component(rgb.x),
        linear_to_srgb_component(rgb.y),
        linear_to_srgb_component(rgb.z)
    );
}

fn pow_vec3(value : vec3<f32>, exponent : f32) -> vec3<f32> {
    return vec3<f32>(
        pow(value.x, exponent),
        pow(value.y, exponent),
        pow(value.z, exponent)
    );
}

fn write_pixel(base_index : u32, color : vec4<f32>) {
    output_buffer[base_index + 0u] = color.x;
    output_buffer[base_index + 1u] = color.y;
    output_buffer[base_index + 2u] = color.z;
    output_buffer[base_index + 3u] = color.w;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let dims : vec2<u32> = textureDimensions(inputTex, 0);
    let width : u32 = dims.x;
    let height : u32 = dims.y;
    if (gid.x >= width || gid.y >= height) {
        return;
    }

    let coords : vec2<i32> = vec2<i32>(i32(gid.x), i32(gid.y));
    let texel : vec4<f32> = textureLoad(inputTex, coords, 0);
    let base_index : u32 = (gid.y * width + gid.x) * CHANNEL_COUNT;

    let levels_raw : f32 = max(params.levels, 0.0);
    let levels_quantized : f32 = max(round(levels_raw), MIN_LEVELS);
    if (levels_quantized <= 1.0) {
        write_pixel(base_index, texel);
        return;
    }

    let level_factor : f32 = levels_quantized;
    let inv_factor : f32 = 1.0 / level_factor;
    let half_step : f32 = inv_factor * 0.5;
    let gamma_value : f32 = max(params.gamma, MIN_GAMMA);
    let inv_gamma : f32 = 1.0 / gamma_value;

    var working_rgb : vec3<f32> = srgb_to_linear_rgb(texel.xyz);
    working_rgb = pow_vec3(clamp(working_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), gamma_value);

    // Posterize: multiply by levels, add 0.5/levels offset, floor, divide by levels
    working_rgb = working_rgb * level_factor;
    working_rgb = working_rgb + vec3<f32>(half_step);
    working_rgb = floor(working_rgb);
    var quantized_rgb : vec3<f32> = working_rgb * inv_factor;
    quantized_rgb = pow_vec3(clamp(quantized_rgb, vec3<f32>(0.0), vec3<f32>(1.0)), inv_gamma);

    quantized_rgb = linear_to_srgb_rgb(quantized_rgb);

    let result_color : vec4<f32> = vec4<f32>(
        clamp_01(quantized_rgb.x),
        clamp_01(quantized_rgb.y),
        clamp_01(quantized_rgb.z),
        texel.w
    );

    write_pixel(base_index, result_color);
}
