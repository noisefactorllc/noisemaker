/*
 * Grade - Three-Way Color Wheels Pass (WGSL)
 * Shadows/Midtones/Highlights color balance
 * Classic 3-way corrector with separate chroma moves per tonal range
 */

struct Uniforms {
    wheelBalance: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    wheelShadows: vec3<f32>,
    _pad3: f32,
    wheelMidtones: vec3<f32>,
    _pad4: f32,
    wheelHighlights: vec3<f32>,
    _pad5: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const LUMA_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);

// sRGB to linear
fn srgbToLinear(srgb: vec3<f32>) -> vec3<f32> {
    var linear: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

// Linear to sRGB
fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    var srgb: vec3<f32>;
    for (var i = 0; i < 3; i++) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// Tonal range weights
fn shadowWeight(luma: f32, balance: f32) -> f32 {
    let boundary = 0.33 - balance * 0.15;
    return 1.0 - smoothstep(0.0, boundary * 2.0, luma);
}

fn midtoneWeight(luma: f32, balance: f32) -> f32 {
    let center = 0.5;
    let spread = 0.4 - abs(balance) * 0.1;
    let dist = abs(luma - center) / spread;
    return max(0.0, 1.0 - dist);
}

fn highlightWeight(luma: f32, balance: f32) -> f32 {
    let boundary = 0.67 + balance * 0.15;
    return smoothstep(boundary - 0.33, 1.0, luma);
}

// Apply color wheel adjustment
fn applyWheels(rgb: vec3<f32>, shadowWheel: vec3<f32>, midWheel: vec3<f32>, 
               highWheel: vec3<f32>, balance: f32) -> vec3<f32> {
    let shadowOffset = (shadowWheel - 0.5) * 2.0;
    let midOffset = (midWheel - 0.5) * 2.0;
    let highOffset = (highWheel - 0.5) * 2.0;
    
    if (length(shadowOffset) < 0.01 && length(midOffset) < 0.01 && length(highOffset) < 0.01) {
        return rgb;
    }
    
    let luma = dot(rgb, LUMA_WEIGHTS);
    
    var sW = shadowWeight(luma, balance);
    var mW = midtoneWeight(luma, balance);
    var hW = highlightWeight(luma, balance);
    
    let totalWeight = sW + mW + hW + 0.001;
    sW /= totalWeight;
    mW /= totalWeight;
    hW /= totalWeight;
    
    var colorShift = vec3<f32>(0.0);
    colorShift += shadowOffset * sW * 0.5;
    colorShift += midOffset * mW * 0.5;
    colorShift += highOffset * hW * 0.5;
    
    var result = rgb + colorShift;
    
    let newLuma = dot(result, LUMA_WEIGHTS);
    let lumaDiff = luma - newLuma;
    result += lumaDiff * 0.3;
    
    return result;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let color = textureSample(inputTex, inputSampler, uv);
    
    var rgb = srgbToLinear(color.rgb);
    
    rgb = applyWheels(rgb, uniforms.wheelShadows, uniforms.wheelMidtones, 
                      uniforms.wheelHighlights, uniforms.wheelBalance);
    
    rgb = linearToSrgb(max(rgb, vec3<f32>(0.0)));
    
    return vec4<f32>(rgb, color.a);
}
