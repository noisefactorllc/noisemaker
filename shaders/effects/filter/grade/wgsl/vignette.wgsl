/*
 * Grade - Vignette Pass (WGSL)
 * Elliptical vignette with highlight preservation
 * Applied as final spatial modifier
 */

struct Uniforms {
    gradeVignetteAmount: f32,
    gradeVignetteMidpoint: f32,
    gradeVignetteRoundness: f32,
    gradeVignetteFeather: f32,
    gradeVignetteHighlightProtect: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
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

// Compute vignette mask
fn computeVignette(uv: vec2<f32>, aspectRatio: vec2<f32>, midpoint: f32, 
                   roundness: f32, feather: f32) -> f32 {
    var centered = uv - 0.5;
    
    var scale: vec2<f32>;
    if (roundness > 0.0) {
        scale = mix(aspectRatio, vec2<f32>(1.0), roundness);
    } else {
        scale = mix(aspectRatio, aspectRatio * vec2<f32>(1.0 + abs(roundness), 1.0 - abs(roundness) * 0.5), -roundness);
    }
    
    centered *= scale;
    
    let dist = length(centered) * 2.0;
    
    let inner = midpoint - feather * 0.5;
    let outer = midpoint + feather * 0.5;
    
    return 1.0 - smoothstep(inner, outer, dist);
}

// Apply vignette
fn applyVignette(rgb: vec3<f32>, vignetteMask: f32, amount: f32, highlightProtect: f32) -> vec3<f32> {
    if (abs(amount) < 0.001) { return rgb; }
    
    var darken = 1.0 - (1.0 - vignetteMask) * abs(amount);
    
    if (highlightProtect > 0.0) {
        let luma = dot(rgb, LUMA_WEIGHTS);
        let protection = smoothstep(0.5, 1.0, luma) * highlightProtect;
        darken = mix(darken, 1.0, protection);
    }
    
    if (amount > 0.0) {
        return rgb * darken;
    } else {
        return 1.0 - (1.0 - rgb) * darken;
    }
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let color = textureSample(inputTex, inputSampler, uv);
    
    if (abs(uniforms.gradeVignetteAmount) < 0.001) {
        return color;
    }
    
    var rgb = srgbToLinear(color.rgb);
    
    var aspectRatio: vec2<f32>;
    if (texSize.x > texSize.y) {
        aspectRatio = vec2<f32>(texSize.x / texSize.y, 1.0);
    } else {
        aspectRatio = vec2<f32>(1.0, texSize.y / texSize.x);
    }
    
    let vignetteMask = computeVignette(uv, aspectRatio, uniforms.gradeVignetteMidpoint, 
                                        uniforms.gradeVignetteRoundness, uniforms.gradeVignetteFeather);
    
    rgb = applyVignette(rgb, vignetteMask, uniforms.gradeVignetteAmount, 
                        uniforms.gradeVignetteHighlightProtect);
    
    rgb = linearToSrgb(max(rgb, vec3<f32>(0.0)));
    
    return vec4<f32>(rgb, color.a);
}
