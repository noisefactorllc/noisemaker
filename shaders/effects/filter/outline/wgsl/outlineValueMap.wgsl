// Outline value map pass - convert input to luminance for edge detection

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var inputSampler : sampler;

fn srgbToLinear(value : f32) -> f32 {
    if (value <= 0.04045) {
        return value / 12.92;
    }
    return pow((value + 0.055) / 1.055, 2.4);
}

fn srgbToLinear3(value : vec3<f32>) -> vec3<f32> {
    return vec3<f32>(srgbToLinear(value.r), srgbToLinear(value.g), srgbToLinear(value.b));
}

fn cubeRoot(value : f32) -> f32 {
    if (value < 0.0) {
        return -pow(-value, 1.0 / 3.0);
    }
    return pow(value, 1.0 / 3.0);
}

fn oklabLComponent(rgb : vec3<f32>) -> f32 {
    let linear = srgbToLinear3(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)));
    let l = 0.4121656120 * linear.r + 0.5362752080 * linear.g + 0.0514575653 * linear.b;
    let m = 0.2118591070 * linear.r + 0.6807189584 * linear.g + 0.1074065790 * linear.b;
    let s = 0.0883097947 * linear.r + 0.2818474174 * linear.g + 0.6302613616 * linear.b;
    let lC = cubeRoot(max(l, 1e-9));
    let mC = cubeRoot(max(m, 1e-9));
    let sC = cubeRoot(max(s, 1e-9));
    return clamp(0.2104542553 * lC + 0.7936177850 * mC - 0.0040720468 * sC, 0.0, 1.0);
}

fn valueMapComponent(texel : vec4<f32>) -> f32 {
    let spread = max(abs(texel.r - texel.g), max(abs(texel.r - texel.b), abs(texel.g - texel.b)));
    if (spread < 1e-5) {
        return clamp(texel.r, 0.0, 1.0);
    }
    return oklabLComponent(texel.rgb);
}

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) texCoord : vec2<f32>,
}

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let texel = textureSample(inputTex, inputSampler, input.texCoord);
    let value = valueMapComponent(texel);
    return vec4<f32>(value, value, value, texel.a);
}
