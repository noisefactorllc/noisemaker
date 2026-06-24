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

// depthSource 0: inputTex = depth, tex = scene
fn applyFocusBlurAB(uv: vec2f, resolution: vec2f) -> vec4f {
    let depthSample = textureSample(inputTex, samp, uv);
    let depth = getLuminosity(depthSample.rgb);

    let blurRadius = computeBlurFactor(depth) * sampleBias;

    var color = vec4f(0.0);
    let GOLDEN: f32 = 2.399963;

    for (var i: i32 = 0; i < 64; i = i + 1) {
        let r = sqrt(f32(i) / 64.0);
        let theta = f32(i) * GOLDEN;
        let offset = vec2f(cos(theta), sin(theta)) * r * blurRadius / resolution;
        color = color + textureSample(tex, samp, uv + offset);
    }

    return color / 64.0;
}

// depthSource 1: tex = depth, inputTex = scene
fn applyFocusBlurBA(uv: vec2f, resolution: vec2f) -> vec4f {
    let depthSample = textureSample(tex, samp, uv);
    let depth = getLuminosity(depthSample.rgb);

    let blurRadius = computeBlurFactor(depth) * sampleBias;

    var color = vec4f(0.0);
    let GOLDEN: f32 = 2.399963;

    for (var i: i32 = 0; i < 64; i = i + 1) {
        let r = sqrt(f32(i) / 64.0);
        let theta = f32(i) * GOLDEN;
        let offset = vec2f(cos(theta), sin(theta)) * r * blurRadius / resolution;
        color = color + textureSample(inputTex, samp, uv + offset);
    }

    return color / 64.0;
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
