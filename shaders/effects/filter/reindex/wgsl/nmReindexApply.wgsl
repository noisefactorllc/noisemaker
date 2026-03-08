// Reindex Pass 3 (Apply): remap pixels using computed global statistics.
const F32_EPSILON : f32 = 0.0001;

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var stats_texture : texture_2d<f32>;
@group(0) @binding(2) var<uniform> uDisplacement : f32;

fn clamp01(value : f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn srgb_to_linear(value : f32) -> f32 {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn cube_root(value : f32) -> f32 {
    if (value == 0.0) {
        return 0.0;
    }
    let sign_value : f32 = select(-1.0, 1.0, value >= 0.0);
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

fn oklab_l_component(rgb : vec3<f32>) -> f32 {
    let r_lin : f32 = srgb_to_linear(clamp01(rgb.x));
    let g_lin : f32 = srgb_to_linear(clamp01(rgb.y));
    let b_lin : f32 = srgb_to_linear(clamp01(rgb.z));

    let l : f32 = 0.4121656120 * r_lin + 0.5362752080 * g_lin + 0.0514575653 * b_lin;
    let m : f32 = 0.2118591070 * r_lin + 0.6807189584 * g_lin + 0.1074065790 * b_lin;
    let s : f32 = 0.0883097947 * r_lin + 0.2818474174 * g_lin + 0.6302613616 * b_lin;

    let l_c : f32 = cube_root(l);
    let m_c : f32 = cube_root(m);
    let s_c : f32 = cube_root(s);

    let lightness : f32 = 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
    return clamp01(lightness);
}

fn value_map_component(texel : vec4<f32>) -> f32 {
    return oklab_l_component(texel.xyz);
}

fn wrap_float(value : f32, range : f32) -> f32 {
    if (range <= 0.0) {
        return 0.0;
    }
    return value - range * floor(value / range);
}

fn wrap_index(value : f32, dimension : i32) -> i32 {
    if (dimension <= 0) {
        return 0;
    }
    let dimension_f : f32 = f32(dimension);
    let wrapped : f32 = wrap_float(value, dimension_f);
    let max_index : f32 = f32(dimension - 1);
    return i32(clamp(floor(wrapped), 0.0, max_index));
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims : vec2<u32> = textureDimensions(inputTex, 0);
    if (dims.x == 0u || dims.y == 0u) {
        return vec4<f32>(0.0);
    }

    let coord : vec2<i32> = vec2<i32>(i32(position.x), i32(position.y));
    if (coord.x < 0 || coord.y < 0 || coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) {
        return vec4<f32>(0.0);
    }

    let texel : vec4<f32> = textureLoad(inputTex, coord, 0);
    let reference_value : f32 = value_map_component(texel);

    let min_max : vec2<f32> = textureLoad(stats_texture, vec2<i32>(0, 0), 0).xy;
    let range : f32 = min_max.y - min_max.x;

    var normalized : f32 = reference_value;
    if (range > F32_EPSILON) {
        normalized = clamp01((reference_value - min_max.x) / range);
    }

    let mod_range : f32 = f32(min(dims.x, dims.y));
    let offset_value : f32 = normalized * uDisplacement * mod_range + normalized;
    let sample_x : i32 = wrap_index(offset_value, i32(dims.x));
    let sample_y : i32 = wrap_index(offset_value, i32(dims.y));

    return textureLoad(inputTex, vec2<i32>(sample_x, sample_y), 0);
}
