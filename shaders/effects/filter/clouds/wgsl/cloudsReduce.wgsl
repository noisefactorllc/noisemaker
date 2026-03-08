// Reduce pass: sample 16x16 block from downsample texture, compute local min/max of control (blue channel)
// Output: .r = min, .g = max

@group(0) @binding(0) var downsampleTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let outCoord: vec2<i32> = vec2<i32>(i32(pos.x), i32(pos.y));
    let inSize: vec2<u32> = textureDimensions(downsampleTex, 0);
    
    // Each output pixel covers a 16x16 area of input
    let baseCoord: vec2<i32> = outCoord * 16;
    
    var minVal: f32 = 100000.0;
    var maxVal: f32 = -100000.0;
    
    // Sample 16x16 block
    for (var dy: i32 = 0; dy < 16; dy = dy + 1) {
        for (var dx: i32 = 0; dx < 16; dx = dx + 1) {
            let sampleCoord: vec2<i32> = baseCoord + vec2<i32>(dx, dy);
            
            // Skip if out of bounds
            if (sampleCoord.x >= i32(inSize.x) || sampleCoord.y >= i32(inSize.y)) {
                continue;
            }
            
            let color: vec4<f32> = textureLoad(downsampleTex, sampleCoord, 0);
            
            // Control is in blue channel
            let control: f32 = color.b;
            
            minVal = min(minVal, control);
            maxVal = max(maxVal, control);
        }
    }
    
    // Store min in r, max in g
    return vec4<f32>(minVal, maxVal, 0.0, 1.0);
}
