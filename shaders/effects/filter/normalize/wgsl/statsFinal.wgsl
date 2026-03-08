// GPGPU Pass 3: Final reduction to 1x1 min/max
// Scans entire input texture to produce single pixel output
// Input has min in .r, max in .g from pyramid reduction

@group(0) @binding(0) var inputTex : texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let inSize : vec2<i32> = vec2<i32>(textureDimensions(inputTex));
    
    var minVal : f32 = 100000.0;
    var maxVal : f32 = -100000.0;
    
    // Scan entire texture
    for (var y : i32 = 0; y < inSize.y; y = y + 1) {
        for (var x : i32 = 0; x < inSize.x; x = x + 1) {
            let color : vec4<f32> = textureLoad(inputTex, vec2<i32>(x, y), 0);
            
            // Input has min in .r, max in .g
            minVal = min(minVal, color.r);
            maxVal = max(maxVal, color.g);
        }
    }
    
    return vec4<f32>(minVal, maxVal, 0.0, 1.0);
}
