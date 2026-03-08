// GPGPU Pass 2: 16:1 reduction of min/max texture
// Input has min in .r, max in .g from previous reduce pass
// Each output pixel covers a 16x16 block of input

@group(0) @binding(0) var inputTex : texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@fragment
fn main(input : VertexOutput) -> @location(0) vec4<f32> {
    let outCoord : vec2<i32> = vec2<i32>(input.position.xy);
    let inSize : vec2<i32> = vec2<i32>(textureDimensions(inputTex));
    
    // Each output pixel covers a 16x16 area of input
    let baseCoord : vec2<i32> = outCoord * 16;
    
    var minVal : f32 = 100000.0;
    var maxVal : f32 = -100000.0;
    
    // Sample 16x16 block
    for (var dy : i32 = 0; dy < 16; dy = dy + 1) {
        for (var dx : i32 = 0; dx < 16; dx = dx + 1) {
            let sampleCoord : vec2<i32> = baseCoord + vec2<i32>(dx, dy);
            
            // Skip if out of bounds
            if (sampleCoord.x >= inSize.x || sampleCoord.y >= inSize.y) {
                continue;
            }
            
            let color : vec4<f32> = textureLoad(inputTex, sampleCoord, 0);
            
            // Input has min in .r, max in .g
            minVal = min(minVal, color.r);
            maxVal = max(maxVal, color.g);
        }
    }
    
    return vec4<f32>(minVal, maxVal, 0.0, 1.0);
}
