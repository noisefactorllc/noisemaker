// GPGPU Pass 1: Compute luminance for each pixel
// Output: R = luminance, G = original x coordinate (normalized), B = 0, A = 1

@group(0) @binding(0) var inputTex : texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

fn srgb_to_lin(value : f32) -> f32 {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn oklab_l(rgb : vec3<f32>) -> f32 {
    let r : f32 = srgb_to_lin(clamp(rgb.r, 0.0, 1.0));
    let g : f32 = srgb_to_lin(clamp(rgb.g, 0.0, 1.0));
    let b : f32 = srgb_to_lin(clamp(rgb.b, 0.0, 1.0));
    
    let l : f32 = 0.4121656120 * r + 0.5362752080 * g + 0.0514575653 * b;
    let m : f32 = 0.2118591070 * r + 0.6807189584 * g + 0.1074065790 * b;
    let s : f32 = 0.0883097947 * r + 0.2818474174 * g + 0.6302613616 * b;
    
    let l_c : f32 = pow(abs(l), 1.0 / 3.0);
    let m_c : f32 = pow(abs(m), 1.0 / 3.0);
    let s_c : f32 = pow(abs(s), 1.0 / 3.0);
    
    return 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
}

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let coord : vec2<i32> = vec2<i32>(input.position.xy);
    let size : vec2<i32> = vec2<i32>(textureDimensions(inputTex));
    
    let texel : vec4<f32> = textureLoad(inputTex, coord, 0);
    let lum : f32 = oklab_l(texel.rgb);
    
    // Store: luminance, normalized x position, 0, 1
    return vec4<f32>(lum, f32(coord.x) / f32(size.x - 1), 0.0, 1.0);
}
