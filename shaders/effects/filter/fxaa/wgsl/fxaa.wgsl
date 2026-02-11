// FXAA antialiasing pass
// Applies an edge-aware blur weighted by luminance differences while preserving alpha.

struct Uniforms {
    data: array<vec4<f32>, 1>,
    // data[0].x = strength
    // data[0].y = sharpness
    // data[0].z = threshold
};

const EPSILON: f32 = 1e-10;
const LUMA_WEIGHTS: vec3<f32> = vec3<f32>(0.299, 0.587, 0.114);

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn luminance_from_rgb(rgb: vec3<f32>) -> f32 {
    return dot(rgb, LUMA_WEIGHTS);
}

fn weight_from_luma(center_luma: f32, neighbor_luma: f32, sharpness: f32) -> f32 {
    return exp(-sharpness * abs(center_luma - neighbor_luma));
}

fn reflect_coord(coord: i32, limit: i32) -> i32 {
    if (limit <= 1) {
        return 0;
    }

    let period: i32 = 2 * limit - 2;
    var wrapped: i32 = coord % period;
    if (wrapped < 0) {
        wrapped = wrapped + period;
    }

    if (wrapped < limit) {
        return wrapped;
    }

    return period - wrapped;
}

fn load_texel(coord: vec2<i32>, size: vec2<i32>) -> vec4<f32> {
    let rx = reflect_coord(coord.x, size.x);
    let ry = reflect_coord(coord.y, size.y);
    return textureLoad(inputTex, vec2<i32>(rx, ry), 0);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let strength = uniforms.data[0].x;
    let sharpness = uniforms.data[0].y;
    let threshold = uniforms.data[0].z;

    let size = vec2<i32>(textureDimensions(inputTex, 0));
    let pixel_coord = vec2<i32>(i32(position.x), i32(position.y));

    let center_texel = load_texel(pixel_coord, size);
    let north_texel = load_texel(pixel_coord + vec2<i32>(0, -1), size);
    let south_texel = load_texel(pixel_coord + vec2<i32>(0, 1), size);
    let west_texel = load_texel(pixel_coord + vec2<i32>(-1, 0), size);
    let east_texel = load_texel(pixel_coord + vec2<i32>(1, 0), size);

    let center_rgb = center_texel.xyz;
    let north_rgb = north_texel.xyz;
    let south_rgb = south_texel.xyz;
    let west_rgb = west_texel.xyz;
    let east_rgb = east_texel.xyz;

    let center_luma = luminance_from_rgb(center_rgb);
    let north_luma = luminance_from_rgb(north_rgb);
    let south_luma = luminance_from_rgb(south_rgb);
    let west_luma = luminance_from_rgb(west_rgb);
    let east_luma = luminance_from_rgb(east_rgb);

    // Threshold: skip AA when max luma contrast is below threshold
    let maxDiff = max(
        max(abs(center_luma - north_luma), abs(center_luma - south_luma)),
        max(abs(center_luma - west_luma), abs(center_luma - east_luma))
    );
    if (maxDiff < threshold) {
        return center_texel;
    }

    let weight_center: f32 = 1.0;
    let weight_north = weight_from_luma(center_luma, north_luma, sharpness);
    let weight_south = weight_from_luma(center_luma, south_luma, sharpness);
    let weight_west = weight_from_luma(center_luma, west_luma, sharpness);
    let weight_east = weight_from_luma(center_luma, east_luma, sharpness);
    let weight_sum = weight_center + weight_north + weight_south + weight_west + weight_east + EPSILON;

    let blended_rgb = (
        center_rgb * weight_center
        + north_rgb * weight_north
        + south_rgb * weight_south
        + west_rgb * weight_west
        + east_rgb * weight_east
    ) / weight_sum;

    let result_texel = vec4<f32>(blended_rgb, center_texel.w);

    // Strength: blend between original and AA result
    return mix(center_texel, result_texel, strength);
}
