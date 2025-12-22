// WGSL Final Render Pass

struct Uniforms {
    resolution: vec2f,
    inputIntensity: f32,
    colorMode: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var trailTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var texSampler: sampler;

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let uv = position.xy / uniforms.resolution;
    
    let trail = textureSample(trailTex, texSampler, uv);
    
    var input_color = vec4f(0.0);
    if (uniforms.colorMode != 0) {
        let flippedUV = vec2f(uv.x, 1.0 - uv.y);
        input_color = textureSample(tex, texSampler, flippedUV);
    }
    
    let inputWeight = uniforms.inputIntensity * 0.01;
    var color = trail.rgb + input_color.rgb * inputWeight;
    
    // Tone mapping
    color = color / (1.0 + color);
    
    return vec4f(color, 1.0);
}
