// Color map render pass - applies CLUT based on normalized luminance
// Matches colorMapRender.glsl

struct Uniforms {
    resolution: vec2<f32>,
    displacement: f32,
    horizontal: f32,
};

const EPSILON: f32 = 1e-6;

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var statsTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn wrap_coord(value: i32, extent: i32) -> i32 {
    if (extent <= 0) {
        return 0;
    }
    var wrapped = value % extent;
    if (wrapped < 0) {
        wrapped = wrapped + extent;
    }
    return wrapped;
}

fn srgb_to_linear(value: f32) -> f32 {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn cube_root(value: f32) -> f32 {
    if (value == 0.0) {
        return 0.0;
    }
    let sign_value = select(-1.0, 1.0, value >= 0.0);
    return sign_value * pow(abs(value), 1.0 / 3.0);
}

fn oklab_l_component(rgb: vec3<f32>) -> f32 {
    let r = srgb_to_linear(clamp01(rgb.x));
    let g = srgb_to_linear(clamp01(rgb.y));
    let b = srgb_to_linear(clamp01(rgb.z));

    let l = 0.4121656120 * r + 0.5362752080 * g + 0.0514575653 * b;
    let m = 0.2118591070 * r + 0.6807189584 * g + 0.1074065790 * b;
    let s = 0.0883097947 * r + 0.2818474174 * g + 0.6302613616 * b;

    let l_c = cube_root(l);
    let m_c = cube_root(m);
    let s_c = cube_root(s);

    return 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
}

fn value_map_component(texel: vec4<f32>, channelCount: u32) -> f32 {
    if (channelCount <= 2u) {
        return texel.x;
    }
    return oklab_l_component(vec3<f32>(texel.x, texel.y, texel.z));
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let width = u32(uniforms.resolution.x);
    let height = u32(uniforms.resolution.y);
    
    if (fragCoord.x >= f32(width) || fragCoord.y >= f32(height)) {
        return vec4<f32>(0.0);
    }

    let channelCount = 4u;
    let displacementValue = uniforms.displacement;
    let isHorizontal = uniforms.horizontal >= 0.5;

    // Read stats from (0,0) of statsTex
    let stats = textureLoad(statsTex, vec2<i32>(0, 0), 0);
    var min_value = stats.r;
    var max_value = stats.g;

    if (min_value > max_value) {
        min_value = 0.0;
        max_value = 0.0;
    }

    let range = max_value - min_value;
    let has_range = abs(range) > EPSILON;

    let coord = floor(fragCoord.xy);
    let texel = textureLoad(inputTex, vec2<i32>(coord), 0);
    let reference_raw = value_map_component(texel, channelCount);

    var normalized = reference_raw;
    if (has_range) {
        normalized = (reference_raw - min_value) / range;
    }

    let reference = normalized * displacementValue;

    let width_i = i32(width);
    let height_i = i32(height);
    let max_x_offset = f32(max(width_i - 1, 0));
    let max_y_offset = f32(max(height_i - 1, 0));

    var offset_x = i32(reference * max_x_offset);
    var offset_y = 0;
    if (!isHorizontal) {
        offset_y = i32(reference * max_y_offset);
    }

    var sample_x = wrap_coord(i32(coord.x) + offset_x, width_i);
    var sample_y = i32(coord.y);
    if (!isHorizontal) {
        sample_y = wrap_coord(i32(coord.y) + offset_y, height_i);
    }

    let clut_sample = textureLoad(tex, vec2<i32>(sample_x, sample_y), 0);
    if (clut_sample.a == 0.0) {
        return texel;
    } else {
        return clut_sample;
    }
}
