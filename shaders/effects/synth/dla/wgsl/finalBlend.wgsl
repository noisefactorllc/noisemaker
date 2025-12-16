// DLA - Final Blend Pass

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var gridTex: texture_2d<f32>;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> inputIntensity: f32;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    let coord = vec2<i32>(in.position.xy);
    
    let inputColor = textureLoad(tex, coord, 0);
    let cluster = textureLoad(gridTex, coord, 0);
    
    let trailVal = clamp(cluster.a, 0.0, 1.0);
    
    // Use the actual cluster color, scaled by emission brightness
    let emission = trailVal * (0.35 + trailVal * 0.8);
    let clusterColor = cluster.rgb;
    
    // Blend input based on inputIntensity (0-100 scale)
    let inputBlend = clamp(inputIntensity / 100.0, 0.0, 1.0);
    let bg = inputColor.rgb * inputBlend;
    let fg = clusterColor * emission;
    let combined = clamp(bg + fg, vec3<f32>(0.0), vec3<f32>(1.0));
    
    let outAlpha = max(inputColor.a, trailVal);
    
    return vec4<f32>(combined, outAlpha);
}
