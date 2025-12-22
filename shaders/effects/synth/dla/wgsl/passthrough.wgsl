struct Uniforms {
    resolution: vec2f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var inputTexSampler: sampler;
@group(0) @binding(3) var gridTex: texture_2d<f32>;
@group(0) @binding(4) var gridTexSampler: sampler;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let uv = fragCoord.xy / u.resolution;
    let input = textureSample(inputTex, inputTexSampler, uv);
    let grid = textureSample(gridTex, gridTexSampler, uv);
    
    // Blend grid structure over input
    // Grid alpha indicates structure presence
    let gridStrength = clamp(grid.a, 0.0, 1.0);
    let gridColor = grid.rgb;
    
    // Mix: where grid exists, show grid color; otherwise show input
    let color = mix(input.rgb, gridColor, gridStrength);
    return vec4f(color, 1.0);
}
