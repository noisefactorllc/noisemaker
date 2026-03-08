// Reindex Pass 1 (Stats): compute lightness range per TILE_SIZE tile.
const TILE_SIZE : i32 = 8;
const F32_MAX : f32 = 3.402823466e38;
const F32_MIN : f32 = -3.402823466e38;

@group(0) @binding(0) var inputTex : texture_2d<f32>;

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

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims : vec2<u32> = textureDimensions(inputTex, 0);
    if (dims.x == 0u || dims.y == 0u) {
        return vec4<f32>(0.0);
    }

    let coord : vec2<i32> = vec2<i32>(i32(position.x), i32(position.y));
    if (coord.x < 0 || coord.y < 0) {
        return vec4<f32>(0.0);
    }

    let local_x : i32 = coord.x % TILE_SIZE;
    let local_y : i32 = coord.y % TILE_SIZE;
    if (local_x != 0 || local_y != 0) {
        return vec4<f32>(0.0);
    }

    var min_value : f32 = F32_MAX;
    var max_value : f32 = F32_MIN;
    let tile_origin : vec2<i32> = coord;
    let width : i32 = i32(dims.x);
    let height : i32 = i32(dims.y);

    for (var oy : i32 = 0; oy < TILE_SIZE; oy = oy + 1) {
        let py : i32 = tile_origin.y + oy;
        if (py >= height) {
            break;
        }
        for (var ox : i32 = 0; ox < TILE_SIZE; ox = ox + 1) {
            let px : i32 = tile_origin.x + ox;
            if (px >= width) {
                break;
            }
            let sample : vec4<f32> = textureLoad(inputTex, vec2<i32>(px, py), 0);
            let value : f32 = value_map_component(sample);
            min_value = min(min_value, value);
            max_value = max(max_value, value);
        }
    }

    return vec4<f32>(min_value, max_value, 0.0, 1.0);
}
