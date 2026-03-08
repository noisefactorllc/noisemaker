/*
 * Sobel edge detection effect
 * Classic Sobel operator for edge detection
 */

struct Uniforms {
    amount: f32,
    alpha: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;
    
    let origColor = textureSample(inputTex, inputSampler, uv);
    
    // Sobel X and Y kernels
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    
    let offsets = array<vec2<f32>, 9>(
        vec2<f32>(-texelSize.x, -texelSize.y),
        vec2<f32>(0.0, -texelSize.y),
        vec2<f32>(texelSize.x, -texelSize.y),
        vec2<f32>(-texelSize.x, 0.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(texelSize.x, 0.0),
        vec2<f32>(-texelSize.x, texelSize.y),
        vec2<f32>(0.0, texelSize.y),
        vec2<f32>(texelSize.x, texelSize.y)
    );
    
    var convX = vec3<f32>(0.0);
    var convY = vec3<f32>(0.0);
    
    for (var i = 0; i < 9; i = i + 1) {
        let sample = textureSample(inputTex, inputSampler, uv + offsets[i] * uniforms.amount).rgb;
        convX = convX + sample * sobel_x[i];
        convY = convY + sample * sobel_y[i];
    }
    
    let dist = distance(convX, convY);
    
    // Multiply with original color
    let result = origColor.rgb * dist;

    // Blend between original input and sobel result
    let blended = mix(origColor.rgb, result, uniforms.alpha);

    return vec4<f32>(blended, origColor.a);
}
