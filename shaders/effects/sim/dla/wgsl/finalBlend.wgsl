// DLA - Final Blend Pass
// Blend accumulated cluster with input, output to fragment

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var gridTex: texture_2d<f32>;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> alpha: f32;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(in.position.xy);
    
    let inputColor = textureLoad(inputTex, coord, 0);
    let cluster = textureLoad(gridTex, coord, 0);
    
    let intensity = clamp(cluster.a, 0.0, 1.0);
    
    // Mono output: grayscale emission
    let emission = intensity * (0.35 + intensity * 0.8);
    let combined = mix(inputColor.rgb, clamp(inputColor.rgb + vec3<f32>(emission), vec3<f32>(0.0), vec3<f32>(1.0)), clamp(alpha, 0.0, 1.0));
    let outAlpha = max(inputColor.a, intensity);
    
    return vec4<f32>(combined, outAlpha);
}
