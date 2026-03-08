// GPGPU Pass 4: Apply normalization using computed min/max values
// Reads 1x1 stats texture at (0,0) to get global min/max
// Input: inputTex = original image, statsTex = 1x1 min/max texture

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var statsTex : texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let coord : vec2<i32> = vec2<i32>(input.position.xy);
    
    // Read global min/max from 1x1 stats texture
    let stats : vec4<f32> = textureLoad(statsTex, vec2<i32>(0, 0), 0);
    let global_min : f32 = stats.r;
    let global_max : f32 = stats.g;
    let range : f32 = global_max - global_min;
    
    // Read input pixel
    let texel : vec4<f32> = textureLoad(inputTex, coord, 0);
    
    // Normalize RGB channels, preserve alpha
    var normalized : vec4<f32>;
    if (range > 0.0001) {
        normalized = vec4<f32>(
            (texel.r - global_min) / range,
            (texel.g - global_min) / range,
            (texel.b - global_min) / range,
            texel.a
        );
    } else {
        // Avoid division by zero
        normalized = texel;
    }
    
    return normalized;
}
