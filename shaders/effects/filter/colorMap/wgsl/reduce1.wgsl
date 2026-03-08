// First reduction pass: 32x32 tile min/max for colorMap
// Matches reduce1.glsl

struct Uniforms {
    resolution: vec2<f32>,
    _pad: vec2<f32>,
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
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
    if (fragCoord.x >= 32.0 || fragCoord.y >= 32.0) {
        return vec4<f32>(0.0);
    }
    
    let width = uniforms.resolution.x;
    let height = uniforms.resolution.y;
    
    let block_w = width / 32.0;
    let block_h = height / 32.0;
    
    let start_x = i32(floor(fragCoord.x * block_w));
    let start_y = i32(floor(fragCoord.y * block_h));
    let end_x = min(i32(floor((fragCoord.x + 1.0) * block_w)), i32(width));
    let end_y = min(i32(floor((fragCoord.y + 1.0) * block_h)), i32(height));
    
    var min_val: f32 = 1e30;
    var max_val: f32 = -1e30;
    
    let channelCount = 4u;
    
    for (var y = start_y; y < end_y; y++) {
        for (var x = start_x; x < end_x; x++) {
            let texel = textureLoad(inputTex, vec2<i32>(x, y), 0);
            let val = value_map_component(texel, channelCount);
            min_val = min(min_val, val);
            max_val = max(max_val, val);
        }
    }
    
    // If block was empty, handle it
    if (min_val > max_val) {
        min_val = 0.0;
        max_val = 0.0;
    }
    
    return vec4<f32>(min_val, max_val, 0.0, 1.0);
}
