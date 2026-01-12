/*
 * Focus blur (depth of field) mixer shader (WGSL)
 * Reconstructs a faux depth buffer from luminance to drive circle-of-confusion blurs
 * Blur radius is based on distance from focal point
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> focalDistance: f32;
@group(0) @binding(4) var<uniform> aperture: f32;
@group(0) @binding(5) var<uniform> sampleBias: f32;
@group(0) @binding(6) var<uniform> depthSource: i32;

// Convert RGB to luminosity for depth estimation
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

// Compute blur factor based on depth distance from focal plane
fn computeBlurFactor(depth: f32) -> f32 {
    let focalPlane = focalDistance * 0.01;
    let blur = abs(depth - focalPlane) * aperture;
    return clamp(blur, 0.0, 1.0);
}

// Apply depth of field blur using inputTex as scene, tex as depth
fn applyFocusBlurAB(uv: vec2f, resolution: vec2f) -> vec4f {
    // Sample depth texture and compute luminosity as depth proxy
    let depthSample = textureSample(inputTex, samp, uv);
    let depth = getLuminosity(depthSample.rgb);
    
    // Calculate blur amount based on distance from focal plane
    let blurFactor = computeBlurFactor(depth) * 10.0;
    
    var color = vec4f(0.0);
    var totalWeight: f32 = 0.0;
    
    // Gaussian blur convolution kernel (9x9)
    for (var x: i32 = -4; x <= 4; x = x + 1) {
        for (var y: i32 = -4; y <= 4; y = y + 1) {
            let offset = vec2f(f32(x), f32(y)) * sampleBias / resolution;
            
            // Gaussian weight based on distance from center
            let dist2 = f32(x * x + y * y);
            let sigma2 = 2.0 * blurFactor * blurFactor;
            let weight = exp(-dist2 / max(sigma2, 0.001));
            
            color = color + textureSample(tex, samp, uv + offset) * weight;
            totalWeight = totalWeight + weight;
        }
    }
    
    return color / totalWeight;
}

// Apply depth of field blur using tex as scene, inputTex as depth
fn applyFocusBlurBA(uv: vec2f, resolution: vec2f) -> vec4f {
    // Sample depth texture and compute luminosity as depth proxy
    let depthSample = textureSample(tex, samp, uv);
    let depth = getLuminosity(depthSample.rgb);
    
    // Calculate blur amount based on distance from focal plane
    let blurFactor = computeBlurFactor(depth) * 10.0;
    
    var color = vec4f(0.0);
    var totalWeight: f32 = 0.0;
    
    // Gaussian blur convolution kernel (9x9)
    for (var x: i32 = -4; x <= 4; x = x + 1) {
        for (var y: i32 = -4; y <= 4; y = y + 1) {
            let offset = vec2f(f32(x), f32(y)) * sampleBias / resolution;
            
            // Gaussian weight based on distance from center
            let dist2 = f32(x * x + y * y);
            let sigma2 = 2.0 * blurFactor * blurFactor;
            let weight = exp(-dist2 / max(sigma2, 0.001));
            
            color = color + textureSample(inputTex, samp, uv + offset) * weight;
            totalWeight = totalWeight + weight;
        }
    }
    
    return color / totalWeight;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2f(textureDimensions(inputTex, 0));
    let uv = position.xy / dims;
    
    var color: vec4f;
    
    // depthSource: 0 = use inputTex (A) as depth map, blur tex (B)
    //              1 = use tex (B) as depth map, blur inputTex (A)
    if (depthSource == 0) {
        color = applyFocusBlurAB(uv, dims);
    } else {
        color = applyFocusBlurBA(uv, dims);
    }
    
    // Preserve maximum alpha from both sources
    let alpha1 = textureSample(inputTex, samp, uv).a;
    let alpha2 = textureSample(tex, samp, uv).a;
    color.a = max(alpha1, alpha2);
    
    return color;
}
