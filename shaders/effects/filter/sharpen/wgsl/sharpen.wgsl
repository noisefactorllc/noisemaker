/*
 * Sharpen convolution effect
 * Enhances image detail and edges
 */

struct Uniforms {
    amount: f32,
    renderScale: f32,
    _pad2: f32,
    _pad3: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let globalCoord = pos.xy + uniforms.tileOffset;
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = globalCoord / uniforms.fullResolution;
    let texelSize = 1.0 / texSize;
    
    let origColor = textureSampleLevel(inputTex, inputSampler, pos.xy / texSize, 0.0);
    
    // Sharpen kernel
    let kernel = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 5.0, 0.0, -1.0, 0.0, -1.0);
    
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
    
    var conv = vec3<f32>(0.0);
    
    for (var i = 0; i < 9; i = i + 1) {
        let sample = textureSampleLevel(inputTex, inputSampler, ((uv + offsets[i] * uniforms.amount * uniforms.renderScale) * uniforms.fullResolution - uniforms.tileOffset) / texSize, 0.0).rgb;
        conv = conv + sample * kernel[i];
    }
    
    return vec4<f32>(clamp(conv, vec3<f32>(0.0), vec3<f32>(1.0)), origColor.a);
}
